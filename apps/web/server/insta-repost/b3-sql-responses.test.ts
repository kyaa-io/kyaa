import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/kst-midnight", () => ({ kstMidnightAfter: () => null }));
import { historySchema } from "@/server/group-wallet/domain";
import { createDukjilHandlers } from "@/server/dukjil/routes";
import { createShareProofHandlers } from "@/server/share-proof/routes";
import { createTierHistoryHandlers } from "@/server/tier-history/routes";
import { createInstaRepostHandlers } from "./routes";

/** Real SQL answers from supabase/tests/dukjil/dukjil_b3_sql_responses.sql (disposable clean-chain database with the B3 migrations). */
const cases = JSON.parse(readFileSync(resolve(__dirname, "b3-sql-responses.json"), "utf8")) as Record<string, Record<string, unknown>>;
const FAN = "b3d00000-0000-4000-8000-000000000011", CREATOR = "b3d00000-0000-4000-8000-000000000001";
const ADMIN = { email: "b3d-adm@byus.test", role: "admin" as const, appUserId: "b3d00000-0000-4000-8000-000000000010", allowlistId: "b3d00000-0000-4000-8000-000000000020" };
const request = (path: string, body?: unknown) => new Request(`https://byus.test${path}`, {
  method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const answering = (map: Record<string, unknown>) => vi.fn(async (name: string) => map[name]);
const base = { authorize: async () => ({ appUserId: FAN }), resolveCreatorId: async (slug: string) => slug === "b3-answer" ? CREATOR : null };

describe("real SQL answers of the B3 payouts", () => {
  it("cheer: a first tap says what it paid, a replay says 0 and carries no points field", async () => {
    for (const [name, earned] of [["cheer_first", 3], ["cheer_replay", 0]] as const) {
      const res = await createDukjilHandlers({ ...base, rpc: answering({ cheer_dukjil_favorite: cases[name] }) }).cheer(request("/api/me/dukjil/cheer", {}));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ earned, stamped: true, replayed: name === "cheer_replay", celebrity: { slug: "b3-answer" } });
      expect(body).not.toHaveProperty("points");
    }
  });
  it.each(["today_v2", "today_empty", "today_empty_creator"])("%s passes the today route", async name => {
    const res = await createDukjilHandlers({ ...base, rpc: answering({ read_dukjil_today: cases[name] }) }).today(request(name === "today_empty" ? "/api/me/dukjil/today" : "/api/me/dukjil/today?creator=b3-answer"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cases[name]);
  });
  it("today: the cheer row is done from the log count, the repost row keeps approvals and payouts apart, the next bonus is the next tier", () => {
    const today = cases.today_v2 as { actions: Record<string, { count: number }>; instaRepost: unknown; nextTierBonus: unknown };
    expect(today.actions.cheer.count).toBe(1);
    expect(today.instaRepost).toEqual({ status: "rejected", rejectCode: "no_hashtag", payResult: null, approvalsToday: 1, approvalsMonth: 1, paidMonth: 1 });
    expect(today.nextTierBonus).toEqual({ tier: "Platinum", points: 300, progress: 1, target: 14 });
    expect(cases.today_empty).toMatchObject({ nextTierBonus: null, instaRepost: { status: null, approvalsToday: 0 } });
  });
  it("repost submit, duplicate and list pass the member routes", async () => {
    const submit = (answer: unknown, body: Record<string, unknown>) => createInstaRepostHandlers({ ...base, authorizeAdmin: vi.fn(), stream: vi.fn(), rpc: answering({ submit_fan_insta_repost: answer }) })
      .submit(request("/api/me/insta-reposts", { creator: "b3-answer", ownPost: true, ...body }));
    const first = await submit(cases.repost_submit, { postKind: "feed", url: "https://www.instagram.com/p/B3answer01/" });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ status: "pending", duplicate: false });
    const again = await submit(cases.repost_submit_duplicate, { postKind: "reel", url: "https://www.instagram.com/reel/B3answer01/" });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true, replayed: true });
    for (const name of ["reposts_list", "reposts_empty"]) {
      const res = await createInstaRepostHandlers({ ...base, authorizeAdmin: vi.fn(), stream: vi.fn(), rpc: answering({ list_fan_insta_reposts: cases[name] }) }).list(request("/api/me/insta-reposts?creator=b3-answer"));
      expect(res.status).toBe(200);
      expect((await res.json()).items).toEqual(cases[name].items);
    }
  });
  it("the share route answers a repost key as a closed duplicate and pays nothing", async () => {
    const rpc = answering({ submit_fan_share_proof: cases.share_submit_duplicate });
    const res = await createShareProofHandlers({ ...base, rpc }).submit(request("/api/me/share-proofs", { creator: "b3-answer", url: "https://www.instagram.com/p/B3answer01/", ownPost: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: cases.share_submit_duplicate.id, replayed: true, duplicate: true });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["submit_fan_share_proof"]);
  });
  it("queue and decisions pass the review routes", async () => {
    const deps = (map: Record<string, unknown>) => ({ ...base, authorizeAdmin: async () => ADMIN, stream: vi.fn(), rpc: answering(map) });
    for (const name of ["queue_pending", "queue_all"]) {
      const res = await createInstaRepostHandlers(deps({ read_insta_repost_review_queue: cases[name] })).adminQueue(request(`/api/admin/insta-reposts?status=${name === "queue_all" ? "all" : "pending"}`));
      expect(res.status).toBe(200);
      expect((await res.json()).items).toEqual(cases[name].items);
    }
    const accept = await createInstaRepostHandlers(deps({ review_fan_insta_repost: cases.review_accept })).adminReview(request("/x", { decision: "accept", revision: 0 }), String(cases.review_accept.id));
    expect(await accept.json()).toEqual({ result: { ...cases.review_accept } });
    expect(cases.review_accept).toMatchObject({ status: "accepted", points: 30, payResult: "paid" });
    const reject = await createInstaRepostHandlers(deps({ review_fan_insta_repost: cases.review_reject })).pageReview(request("/x", { decision: "reject", revision: 0, rejectCode: "no_hashtag" }), String(cases.review_reject.id));
    expect((await reject.json()).result).toMatchObject({ status: "rejected", points: 0, payResult: null });
    const queued = (cases.queue_all as { items: { status: string; clawedBack: boolean }[] }).items;
    expect(queued.map(item => item.status).sort()).toEqual(["accepted", "rejected"]);
  });
  it("tier changes carry the bonus paid for each rise", async () => {
    for (const name of ["tier_changes_bonus", "tier_changes_empty"]) {
      const res = await createTierHistoryHandlers({ authorize: base.authorize, rpc: answering({ observe_fan_tiers: cases[name] }) }).changes(request("/api/me/tier-changes"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(cases[name]);
    }
    expect((cases.tier_changes_bonus as { changes: { tier: string; bonusPoints?: number }[] }).changes.map(c => [c.tier, c.bonusPoints])).toEqual([["Silver", 30], ["Gold", 100]]);
  });
  it("the wallet history names the tier of a bonus and the repost take-back", () => {
    const history = historySchema.parse(cases.wallet_history);
    expect(history.entries.filter(e => e.actionKey === "tier_bonus").map(e => e.tier).sort()).toEqual(["Gold", "Silver"]);
    expect(history.entries.filter(e => e.actionKey !== "tier_bonus").every(e => e.tier === undefined)).toBe(true);
    const revoked = historySchema.parse(cases.wallet_history_revoked);
    expect(revoked.entries.some(e => e.correctionReason === "insta_repost_revoked" && e.actionKey === "insta_repost" && e.amount === -30)).toBe(true);
  });
});
