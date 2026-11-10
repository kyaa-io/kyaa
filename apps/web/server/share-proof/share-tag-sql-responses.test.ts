import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createShareProofHandlers } from "./routes";
import { shareProofAdminRoutes } from "./admin";

/** Real SQL answers from supabase/tests/share_tag_sql_responses.sql (local disposable database with 20261221140000 applied). */
const cases = JSON.parse(readFileSync(resolve(__dirname, "share-tag-sql-responses.json"), "utf8")) as Record<string, Record<string, unknown>>;
const accepted = cases.review_accept as { id: string; appUserId: string; creatorId: string; creatorSlug: string };
const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666", email: "admin@byus.test", role: "admin" as const };
const answering = (map: Record<string, unknown>) => vi.fn(async (name: string) => map[name]);
const json = (path: string, body?: unknown) => new Request(`https://byus.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const member = (rpc: ReturnType<typeof answering>) => createShareProofHandlers({ rpc, authorize: async () => ({ appUserId: accepted.appUserId }), resolveCreatorId: async () => accepted.creatorId });
const admin = (rpc: ReturnType<typeof answering>) => ({ rpc, authorizeAdmin: async () => ADMIN as never });

describe("real SQL answers of the share tag review", () => {
  it("a submission answers pending, a repeat answers a replay, and neither pays", async () => {
    for (const [name, status, replayed] of [["submit_pending", 201, false], ["submit_replay", 200, true]] as const) {
      const rpc = answering({ submit_fan_share_proof: cases[name] });
      const res = await member(rpc).submit(json("/api/me/share-proofs", { creator: "s15-test-creator", url: "https://www.instagram.com/p/ShareTag01/", ownPost: true }));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ id: accepted.id, replayed, status: "pending" });
      expect(rpc.mock.calls.map(([called]) => called)).toEqual(["submit_fan_share_proof"]);
    }
  });
  it("the member list shows pending, accepted-unpaid and rejected proofs", async () => {
    for (const name of ["list_pending", "list_after"]) {
      const res = await member(answering({ list_fan_share_proofs: cases[name] })).list(json("/api/me/share-proofs?creator=s15-test-creator"));
      expect(res.status).toBe(200);
      expect((await res.json()).items).toEqual(cases[name].items);
    }
  });
  it("the operator list and both decisions pass the admin routes; accepting pays through the proof's lock", async () => {
    for (const name of ["admin_list_pending", "admin_list_rejected"]) {
      const res = await shareProofAdminRoutes.list(admin(answering({ read_admin_share_proofs: cases[name] })))(json("/api/admin/share-proofs"));
      expect(res.status).toBe(200);
      expect((await res.json()).items).toEqual(cases[name].items);
    }
    const rpc = answering({ review_fan_share_proof: cases.review_accept, pay_fan_share_proof: { points: 10, stampId: null, capped: false, reason: null, replayed: false } });
    const paid = await shareProofAdminRoutes.review(admin(rpc))(json("/x", { decision: "accept", revision: 0 }), { id: accepted.id });
    expect(await paid.json()).toEqual({ result: { id: accepted.id, status: "accepted", replayed: false, reward: { points: 10 } } });
    expect(rpc.mock.calls.map(([called]) => called)).toEqual(["review_fan_share_proof", "pay_fan_share_proof"]);
    const rejectRpc = answering({ review_fan_share_proof: cases.review_reject });
    const rejected = await shareProofAdminRoutes.review(admin(rejectRpc))(json("/x", { decision: "reject", revision: 0, rejectCode: "no_hashtag" }), { id: (cases.review_reject as { id: string }).id });
    expect((await rejected.json()).result).toMatchObject({ status: "rejected", replayed: false });
    expect(rejectRpc.mock.calls.map(([called]) => called)).toEqual(["review_fan_share_proof"]);
    const replay = await shareProofAdminRoutes.review(admin(answering({ review_fan_share_proof: cases.review_accept_replay, pay_fan_share_proof: new Error("connection reset"), record_dukjil_award_failure: null })))(json("/x", { decision: "accept", revision: 0 }), { id: accepted.id });
    expect((await replay.json()).result).toMatchObject({ status: "accepted", replayed: true });
  });
});
