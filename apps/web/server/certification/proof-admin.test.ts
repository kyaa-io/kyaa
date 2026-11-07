import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));
vi.mock("../config/env", () => ({ loadServerEnv: vi.fn() }));
vi.mock("./certification-dependencies", () => ({ createCertificationDependencies: vi.fn() }));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { ProofAdminError, ProofAdminRepository, proofAdminRoutes, type ProofAdminDependencies } from "./proof-admin";

const sub = "11111111-1111-4111-8111-111111111111";
const stamp = "22222222-2222-4222-8222-222222222222";
const admin = { appUserId: "33333333-3333-4333-8333-333333333333", allowlistId: sub, email: "a@byus.test", role: "admin" };

function deps(over: Record<string, unknown> = {}, auth?: () => Promise<unknown>): ProofAdminDependencies {
  return {
    authorizeAdmin: vi.fn(auth ?? (async () => admin)),
    repository: {
      queue: vi.fn(async () => []),
      pointReviews: vi.fn(async () => []),
      review: vi.fn(async () => ({ id: sub, status: "approved", revision: 3, replayed: false })),
      imageLink: vi.fn(async () => ({ url: "https://s3.test/signed?X=1", expiresInSeconds: 120 })),
      voidStamp: vi.fn(async () => ({ stampId: stamp, replayed: false, pointCorrection: "none", jjinfanRevoked: false })),
      ...over,
    },
  } as unknown as ProofAdminDependencies;
}
const post = (body: unknown, headers: Record<string, string> = { authorization: "Bearer t" }) =>
  new Request("https://x.test/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("proof admin routes", () => {
  it("rejects a call without a token and without admin rights, and never reaches the database", async () => {
    const d = deps();
    expect((await proofAdminRoutes.review(d)(post({ expectedRevision: 1, decision: "approved" }, {}), { id: sub })).status).toBe(401);
    const denied = deps({}, async () => { throw new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"); });
    expect((await proofAdminRoutes.review(denied)(post({ expectedRevision: 1, decision: "approved" }), { id: sub })).status).toBe(403);
    expect((await proofAdminRoutes.voidStamp(denied)(post({ requestKey: "key-12345", reason: "abuse" }), { id: stamp })).status).toBe(403);
    expect((await proofAdminRoutes.queue(denied)(new Request("https://x.test/api"))).status).toBe(401);
    expect(d.repository.review).not.toHaveBeenCalled();
    expect(denied.repository.review).not.toHaveBeenCalled();
    expect(denied.repository.voidStamp).not.toHaveBeenCalled();
  });

  it("approves without a body (the stored submission text is used), and a reject or resubmission request needs a free reason", async () => {
    const d = deps();
    const ok = await proofAdminRoutes.review(d)(post({ expectedRevision: 2, decision: "approved" }), { id: sub });
    expect(ok.status).toBe(200);
    expect(d.repository.review).toHaveBeenCalledWith(admin, sub, { expectedRevision: 2, decision: "approved", reason: undefined });
    for (const decision of ["rejected", "changes_requested"]) {
      expect((await proofAdminRoutes.review(d)(post({ expectedRevision: 2, decision }), { id: sub })).status).toBe(400);
      expect((await proofAdminRoutes.review(d)(post({ expectedRevision: 2, decision, reason: "금액이 안 보여요" }), { id: sub })).status).toBe(200);
    }
    expect(d.repository.review).toHaveBeenCalledTimes(3);
    expect((await proofAdminRoutes.review(d)(post({ expectedRevision: 2, decision: "deleted" }), { id: sub })).status).toBe(400);
    expect((await proofAdminRoutes.review(d)(post({ expectedRevision: 2, decision: "approved" }), { id: "nope" })).status).toBe(400);
  });

  it("reads the membership unique index (23505) from the database as an already approved certification, not 503", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "certification_membership_approved_once"' } }));
    const repository = new ProofAdminRepository({ rpc } as never);
    await expect(repository.review(admin as never, sub, { expectedRevision: 1, decision: "approved" })).rejects.toMatchObject({ code: "PROOF_ALREADY_APPROVED" });
    const d = deps({ review: vi.fn(() => repository.review(admin as never, sub, { expectedRevision: 1, decision: "approved" })) });
    const res = await proofAdminRoutes.review(d)(post({ expectedRevision: 1, decision: "approved" }), { id: sub });
    expect(res.status).toBe(409); expect(await res.json()).toEqual({ error: { code: "PROOF_ALREADY_APPROVED" } });
  });
  it("maps state-transition failures to stable codes and statuses", async () => {
    const cases: [string, number][] = [
      ["REVISION_CONFLICT", 409], ["INVALID_TRANSITION", 409], ["PROOF_STAMP_UNAVAILABLE", 409], ["PROOF_NOT_FOUND", 404], ["ADMIN_REQUIRED", 403],
      ["PROOF_ALREADY_APPROVED", 409],
    ];
    for (const [code, status] of cases) {
      const d = deps({ review: vi.fn(async () => { throw new ProofAdminError(code); }) });
      const res = await proofAdminRoutes.review(d)(post({ expectedRevision: 1, decision: "approved" }), { id: sub });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: { code } });
    }
  });

  it("surfaces the wallet-off and write-fence codes from a stamp void with an explicit 503", async () => {
    for (const code of ["GROUP_WALLET_UNAVAILABLE", "GROUP_WALLET_WRITE_FENCED"]) {
      const rpc = vi.fn(async () => ({ data: null, error: { message: `${code}` } }));
      const repo = new ProofAdminRepository({ rpc, storage: {} } as never);
      const d = { authorizeAdmin: vi.fn(async () => admin), repository: repo } as unknown as ProofAdminDependencies;
      const res = await proofAdminRoutes.voidStamp(d)(post({ requestKey: "key-12345", reason: "abuse" }), { id: stamp });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: { code } });
    }
  });

  it("returns 403 with the code when the member account is restricted", async () => {
    const d = deps({ review: vi.fn(async () => { throw new ProofAdminError("FAN_WEB_ACTIVE_ACCOUNT_REQUIRED"); }) });
    const res = await proofAdminRoutes.review(d)(post({ expectedRevision: 1, decision: "approved" }), { id: sub });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED" } });
  });

  it("passes the replayed flag through so a retry shows the earlier result", async () => {
    const d = deps({ review: vi.fn(async () => ({ id: sub, status: "approved", revision: 3, replayed: true })) });
    const res = await proofAdminRoutes.review(d)(post({ expectedRevision: 2, decision: "approved" }), { id: sub });
    expect((await res.json()).submission.replayed).toBe(true);
  });

  it("voids a stamp through the server path with an idempotency key and optional sanction", async () => {
    const d = deps();
    const res = await proofAdminRoutes.voidStamp(d)(post({ requestKey: "key-12345", reason: "콘텐츠 삭제", sanction: true }), { id: stamp });
    expect(res.status).toBe(200);
    expect(d.repository.voidStamp).toHaveBeenCalledWith(admin, stamp, { requestKey: "key-12345", reason: "콘텐츠 삭제", sanction: true });
    expect((await proofAdminRoutes.voidStamp(d)(post({ requestKey: "key-12345" }), { id: stamp })).status).toBe(400);
    const missing = deps({ voidStamp: vi.fn(async () => { throw new ProofAdminError("STAMP_NOT_FOUND"); }) });
    expect((await proofAdminRoutes.voidStamp(missing)(post({ requestKey: "key-12345", reason: "abuse" }), { id: stamp })).status).toBe(404);
  });

  it("validates the queue status and returns rows", async () => {
    const d = deps();
    const headers = { authorization: "Bearer t" };
    expect((await proofAdminRoutes.queue(d)(new Request("https://x.test/api?status=bad", { headers }))).status).toBe(400);
    expect((await proofAdminRoutes.queue(d)(new Request("https://x.test/api?status=pending", { headers }))).status).toBe(200);
    expect(d.repository.queue).toHaveBeenCalledWith(admin, "pending");
  });

  it("lists point reviews with a fixed shape, paging cursor and mapped errors", async () => {
    const headers = { authorization: "Bearer t" };
    const item = { id: stamp, stampId: stamp, appUserId: admin.appUserId, celebrityId: sub, amount: 30, reason: "r", voidReason: null, source: "action", createdAt: "2026-11-05T10:00:00Z" };
    const d = deps({ pointReviews: vi.fn(async () => [item]) });
    const res = await proofAdminRoutes.pointReviews(d)(new Request("https://x.test/api?before=2026-11-06T00:00:00Z", { headers }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ reviews: [item], hasMore: false });
    expect(d.repository.pointReviews).toHaveBeenCalledWith(admin, "2026-11-06T00:00:00.000Z");
    expect((await proofAdminRoutes.pointReviews(d)(new Request("https://x.test/api?before=nope", { headers }))).status).toBe(400);
    expect((await proofAdminRoutes.pointReviews(deps({}, async () => { throw new AuthError("AUTHENTICATION_REQUIRED", 401, "x"); }))(new Request("https://x.test/api", { headers }))).status).toBe(401);
    const denied = deps({ pointReviews: vi.fn(async () => { throw new ProofAdminError("ADMIN_REQUIRED"); }) });
    const out = await proofAdminRoutes.pointReviews(denied)(new Request("https://x.test/api", { headers }));
    expect(out.status).toBe(403);
    expect(await out.json()).toEqual({ error: { code: "ADMIN_REQUIRED" } });
  });

  it("gives an admin a short-lived image link, and a non-admin or anonymous caller gets nothing", async () => {
    const up = "44444444-4444-4444-8444-444444444444";
    const d = deps();
    const ok = await proofAdminRoutes.imageLink(d)(new Request("https://x.test/api", { headers: { authorization: "Bearer t" } }), { id: sub, uploadId: up });
    expect(ok.status).toBe(200);
    expect((await ok.json()).image).toEqual({ url: "https://s3.test/signed?X=1", expiresInSeconds: 120 });
    expect(d.repository.imageLink).toHaveBeenCalledWith(admin, sub, up);
    const denied = deps({}, async () => { throw new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"); });
    expect((await proofAdminRoutes.imageLink(denied)(new Request("https://x.test/api", { headers: { authorization: "Bearer t" } }), { id: sub, uploadId: up })).status).toBe(403);
    expect((await proofAdminRoutes.imageLink(d)(new Request("https://x.test/api"), { id: sub, uploadId: up })).status).toBe(401);
    expect(denied.repository.imageLink).not.toHaveBeenCalled();
    expect((await proofAdminRoutes.imageLink(d)(new Request("https://x.test/api", { headers: { authorization: "Bearer t" } }), { id: "x", uploadId: up })).status).toBe(400);
    const none = deps({ imageLink: vi.fn(async () => null) });
    expect((await proofAdminRoutes.imageLink(none)(new Request("https://x.test/api", { headers: { authorization: "Bearer t" } }), { id: sub, uploadId: up })).status).toBe(404);
  });

  it("never lets a shared cache keep the signed link, and never logs it", async () => {
    const up = "44444444-4444-4444-8444-444444444444";
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const req = () => new Request("https://x.test/api", { headers: { authorization: "Bearer t" } });
    const ok = await proofAdminRoutes.imageLink(deps())(req(), { id: sub, uploadId: up });
    const missing = await proofAdminRoutes.imageLink(deps({ imageLink: vi.fn(async () => null) }))(req(), { id: sub, uploadId: up });
    const denied = await proofAdminRoutes.imageLink(deps({}, async () => { throw new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"); }))(req(), { id: sub, uploadId: up });
    for (const res of [ok, missing, denied]) {
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("vary")).toContain("Authorization");
    }
    expect(spies.some((s) => s.mock.calls.length > 0)).toBe(false);
    spies.forEach((s) => s.mockRestore());
  });

  it("builds the signed link from the proof source of that submission only", async () => {
    const rpc = vi.fn(async () => ({ data: { bucket: "certification-proofs", storagePath: "a/b.webp", contentType: "image/webp" }, error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://s3.test/x" }, error: null }));
    const repo = new ProofAdminRepository({ rpc, storage: { from: vi.fn(() => ({ createSignedUrl })) } } as never);
    const link = await repo.imageLink(admin as never, sub, "44444444-4444-4444-8444-444444444444");
    expect(rpc).toHaveBeenCalledWith("get_admin_certification_proof_source", expect.objectContaining({ p_actor: admin.appUserId, p_submission_id: sub }));
    expect(createSignedUrl).toHaveBeenCalledWith("a/b.webp", 120);
    expect(link).toEqual({ url: "https://s3.test/x", expiresInSeconds: 120 });
  });
});
