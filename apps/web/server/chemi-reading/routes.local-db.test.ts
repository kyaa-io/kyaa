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
    authorize: async () => ({ appUserId: (globalThis as { __chemiPayMember?: string }).__chemiPayMember ?? user }),
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
      // PostgREST returns a set-returning function as a JSON array and a scalar as the bare value.
      const call = `public.${name}(${params.join(",")})`;
      let output: string;
      try {
        output = sql(
          name === "chemi_point_balances"
            ? `select coalesce(json_agg(t),'[]') from ${call} t`
            : `select ${call}`,
        );
      } catch (error) {
        throw Error(
          String((error as { stderr?: string }).stderr).match(
            /ERROR:\s+(\S+)/,
          )?.[1] ?? "SQL_FAILED",
        );
      }
      if (output === "") return null;
      if (output === "t" || output === "f") return output === "t";
      try {
        return JSON.parse(output);
      } catch {
        return output;
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
  sql("update group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date");
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

it.skipIf(!process.env.CHEMI_LOCAL_ROUTES)("tops up through the DEV order route, buys with both ledgers and cancels", async () => {
  expect(process.env.PGHOST).toMatch(/\/byus-clean-db\.[^/]+\/socket$/);
  expect(process.env.PGDATABASE).toBe("byus_clean");
  sql("update group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date");
  const { POST: topup } = await import("@/app/api/chemi/points/topup/route");
  vi.stubEnv("CHEMI_TAB", "true");
  vi.stubEnv("APP_ENV", "dev");
  const member = randomUUID();
  sql(`insert into app_users(id,privy_user_id,verified_email) values('${member}','did:privy:${member}','${member}@example.invalid');
    insert into chemi_profiles(user_id,birth_date,calendar,birth_time,time_precision,consent_version,consent_at)
    values('${member}','1995-05-05','solar','14:30','exact','test',now());
    select group_wallet_post('${member}','fan_point',1,'chemi_reward',gen_random_uuid())`);
  const balances = () => sql(`select activity_points||'/'||paid_points||'/'||total_points from chemi_point_balances('${member}')`);
  // The mocked authorization returns this member for the rest of the test.
  Object.assign(globalThis, { __chemiPayMember: member });
  let provider = { status: "DONE", totalAmount: 1000, balanceAmount: 1000, currency: "KRW", orderId: "" };
  vi.spyOn(await import("./topup-provider"), "pointPaymentProvider").mockReturnValue({
    checkout: async () => "https://fixture.invalid/pay",
    lookup: async () => ({ ...provider, status: provider.status as "DONE" | "CANCELED" }),
  });
  const call = (body: unknown) => topup(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer fixture" }, body: JSON.stringify(body) }));
  const day = sql("select dukjil_kst_date()+5");
  const date = async (confirm: boolean) => (await openDate(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer fixture" }, body: JSON.stringify({ day, character: "dosa", confirm }) }))).json();

  expect(await date(false)).toMatchObject({ price: 3, balance: 1 });
  expect(balances()).toBe("1/0/1");
  expect(await date(false)).not.toHaveProperty("topupPath");
  vi.stubEnv("CHEMI_TOPUP_ENABLED", "true");
  const opened = await (await call({ action: "open" })).json();
  expect(opened).toMatchObject({ amount: 1000, checkoutUrl: "https://fixture.invalid/pay" });
  provider.orderId = opened.orderId;
  expect((await call({ action: "refresh", orderId: randomUUID() })).status).toBe(404);
  provider = { ...provider, totalAmount: 999, balanceAmount: 999 };
  expect((await call({ action: "refresh", orderId: opened.orderId })).status).toBe(409);
  expect(balances()).toBe("1/0/1");
  provider = { ...provider, totalAmount: 1000, balanceAmount: 1000 };
  const confirmed = await (await call({ action: "refresh", orderId: opened.orderId })).json();
  expect(confirmed).toMatchObject({ status: "DONE", balances: [{ activity_points: 1, paid_points: 100, total_points: 101 }] });
  await call({ action: "refresh", orderId: opened.orderId });
  expect(balances()).toBe("1/100/101");

  expect(await date(false)).toMatchObject({ price: 3, balance: 101 });
  vi.stubEnv("CHEMI_TOPUP_ENABLED", "false");
  const bought = await date(true);
  expect(bought).toMatchObject({ balance: 98, kstDate: day, result: { locked: false } });
  expect(balances()).toBe("0/98/98");
  expect(await date(true)).toMatchObject({ replayed: true, readingId: bought.readingId });
  expect(balances()).toBe("0/98/98");

  provider = { ...provider, status: "CANCELED", balanceAmount: 0 };
  vi.stubEnv("CHEMI_TOPUP_ENABLED", "true");
  const refused = await call({ action: "refresh", orderId: opened.orderId });
  expect(refused.status).toBe(409);
  expect(balances()).toBe("0/98/98");

  // A second order that is cancelled before any spending returns to the activity balance only.
  provider = { ...provider, status: "DONE", balanceAmount: 1000 };
  const second = await (await call({ action: "open" })).json();
  provider.orderId = second.orderId;
  await call({ action: "refresh", orderId: second.orderId });
  expect(balances()).toBe("0/198/198");
  provider = { ...provider, status: "CANCELED", balanceAmount: 0 };
  expect(await (await call({ action: "refresh", orderId: second.orderId })).json()).toMatchObject({ status: "CANCELED" });
  expect(balances()).toBe("0/98/98");
});
