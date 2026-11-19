import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/chemi/readings/route";
import { POST as openDate } from "@/app/api/chemi/fortune/date/route";
import { POST as visit } from "@/app/api/chemi/visit/route";
import { POST as share } from "@/app/api/chemi/shares/route";
import { POST as done } from "@/app/api/chemi/shares/[id]/done/route";
import { GET as detail } from "@/app/api/chemi/readings/[id]/route";
import { GET as publicCard } from "@/app/api/chemi/shares/[id]/route";

const user = randomUUID();
const sql = (q: string) =>
  execFileSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-c", q], {
    encoding: "utf8",
  }).trim();
vi.mock("server-only", () => ({}));
vi.mock("@/server/dukjil/creator-id", () => ({
  resolveCreatorId: async () => user,
}));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({
    authorize: async () => ({ appUserId: user }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      const params = Object.entries(args).map(
        ([k, v]) =>
          k +
          "=>" +
          (v == null
            ? "null"
            : "'" +
              (typeof v === "object"
                ? JSON.stringify(v)
                : String(v)
              ).replaceAll("'", "''") +
              "'"),
      );
      try {
        return JSON.parse(
          sql("select public." + name + "(" + params.join(",") + ")"),
        );
      } catch (error) {
        throw Error(
          String((error as { stderr?: string }).stderr).match(
            /ERROR:\s+(\S+)/,
          )?.[1] ?? "SQL_FAILED",
        );
      }
    },
  }),
}));
it.skipIf(!process.env.CHEMI_LOCAL_ROUTES)(
  "saves, replays, lists and shares readings through route exports",
  async () => {
    expect(process.env.PGHOST).toMatch(/\/byus-clean-db\.[^/]+\/socket$/);
    expect(process.env.PGDATABASE).toBe("byus_clean");
    vi.stubEnv("CHEMI_TAB", "true");
    vi.stubEnv("CHEMI_TAROT_SALT", "disposable-test-salt-disposable-test");
    sql(
      `insert into app_users(id,privy_user_id,verified_email) values('${user}','did:privy:${user}','${user}@example.invalid')`,
    );
    const post = (body: unknown) =>
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { authorization: "Bearer test" },
      });
    expect(await (await visit(post({}))).json()).toEqual({ dot: false });
    sql(`insert into chemi_profiles(user_id,birth_date,calendar,birth_time,time_precision,consent_version,consent_at)
      values('${user}','1995-05-05','solar','14:30','exact','test',now())`);
    for (const [content, kind] of [
      ["fortune", "daily"],
      ["saju", "first"],
      ["star", "daily"],
    ]) {
      const response = await POST(post({ content, kind, character: "dosa" }));
      expect(await response.json()).toMatchObject({
        readingId: expect.any(String),
        replayed: false,
      });
    }
    const partners = [randomUUID(), randomUUID()];
    for (const id of partners)
      sql(`insert into chemi_partners(id,user_id,nickname,birth_date,calendar,time_precision,source)
      values('${id}','${user}','friend','1997-05-05','solar','unknown','saju')`);
    const pair = (id: string, content: string, kind: string) =>
      POST(post({ partnerId: id, content, kind, character: "dosa" }));
    expect((await pair(partners[0], "saju", "compat")).status).toBe(200);
    expect((await pair(partners[0], "star", "compat")).status).toBe(200);
    expect((await pair(partners[1], "star", "compat")).status).toBe(402);
    expect((await pair(partners[1], "fortune", "friend_today")).status).toBe(
      200,
    );
    const day = sql("select dukjil_kst_date()");
    const { drawMemberTarot } = await import("@/server/chemi-engine/tarot");
    const [expected] = drawMemberTarot({ userId: user, kstDate: day, deckVersion: "tarot-v1", salt: process.env.CHEMI_TAROT_SALT, position: 5 });
    const read = () =>
      POST(post({ content: "tarot", kind: "daily", character: "dosa", position: 5, d: day, card: (expected.card + 1) % 78, rev: !expected.reversed }));
    const saved = await (await read()).json();
    expect(saved.result.cards).toEqual([expected]);
    expect(saved.replayed).toBe(false);
    expect(await (await read()).json()).toMatchObject({
      readingId: saved.readingId,
      replayed: true,
    });
    const favorite = () => POST(post({ content: "tarot", kind: "daily", character: "yuna", position: 17 }));
    const rewards = await Promise.all(Array.from({ length: 8 }, async () => {
      const response = await (await favorite()).json();
      expect(response).toMatchObject({ readingId: saved.readingId, result: saved.result, replayed: true });
      return response.reward.exp ?? 0;
    }));
    expect(rewards.sort()).toEqual([0, 0, 0, 0, 0, 0, 0, 10]);
    expect(
      await (await GET(new Request("http://localhost/?content=tarot"))).json(),
    ).toMatchObject([{ readingId: saved.readingId }]);
    const card = await (
      await share(post({ readingId: saved.readingId, character: "changha" }))
    ).json();
    expect(card.url).toBe("/chemi/tarot?from=" + card.shareId);
    const entry = await detail(new Request("http://localhost/?c=elina"), {
      params: Promise.resolve({ id: saved.readingId }),
    });
    expect(await entry.json()).toMatchObject({
      readingId: saved.readingId,
      result: saved.result,
    });
    const publicResult = await publicCard(new Request("http://localhost"), {
      params: Promise.resolve({ id: card.shareId }),
    });
    expect(await publicResult.json()).toMatchObject({
      content: "tarot",
      character: "changha",
    });
    const guest = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          content: "tarot",
          kind: "daily",
          character: "dosa",
        }),
      }),
    );
    expect(await guest.json()).toMatchObject({ readingId: null, reward: {} });
    const finish = () =>
      done(post({ via: "copy" }), {
        params: Promise.resolve({ id: card.shareId }),
      });
    expect(await (await finish()).json()).toEqual({
      reward: { pass: 1, exp: 5 },
    });
    expect(await (await finish()).json()).toEqual({ reward: {} });
  },
);

it.skipIf(!process.env.CHEMI_LOCAL_ROUTES)("opens a quoted date with the computed result and restores it", async () => {
  expect(process.env.PGHOST).toMatch(/\/byus-clean-db\.[^/]+\/socket$/);
  expect(process.env.PGDATABASE).toBe("byus_clean");
  vi.stubEnv("CHEMI_TAB", "true");
  sql(`insert into app_users(id,privy_user_id,verified_email) values('${user}','did:privy:${user}','${user}@example.invalid') on conflict do nothing;
    insert into chemi_profiles(user_id,birth_date,calendar,birth_time,time_precision,consent_version,consent_at)
    values('${user}','1995-05-05','solar','14:30','exact','test',now()) on conflict do nothing;
    select group_wallet_post('${user}','fan_point',3,'chemi_reward',gen_random_uuid())`);
  const day = sql("select dukjil_kst_date()+3");
  const open = async (confirm: boolean) => {
    const response = await openDate(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer fixture" },
      body: JSON.stringify({ day, character: "dosa", confirm }) }));
    expect(response.status).toBe(200);
    return response.json();
  };
  expect(await open(false)).toMatchObject({ price: 3 });
  const reading = await open(true);
  expect(reading).toMatchObject({ kstDate: day, result: { locked: false, score: expect.any(Number) } });
  expect(await open(true)).toMatchObject({ replayed: true, readingId: reading.readingId, balance: reading.balance });
});
