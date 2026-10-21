import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createParticipationHandler, createParticipationAdminHandler } from "./participation-route";
import { encryptParticipationName, parseParticipationKey, participationNameFingerprint } from "./participation-crypto";
const id = "10000000-0000-4000-8000-000000000001";
const receipt = { id, createdAt: "2026-10-20T04:00:00.123456+00:00" };
const key = parseParticipationKey("12".repeat(32));
const deps = { authorize: vi.fn(), authorizeAdmin: vi.fn(), rpc: vi.fn() };
const handler = createParticipationHandler(deps, () => key);
const admin = createParticipationAdminHandler(deps, () => key);
const post = (body: unknown = { code: "abcd-efgh", name: " 김가온 " }, requestId = id) => new Request("https://byus.kr/api/kyaa-wave/participation", { method: "POST", headers: { "idempotency-key": requestId }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); deps.authorize.mockResolvedValue({ appUserId: id }); deps.authorizeAdmin.mockResolvedValue({ appUserId: id, allowlistId: id }); deps.rpc.mockResolvedValue({ participation: receipt }); });
describe("participation boundaries", () => {
 it.each(["ABC234", "ABCDEFGH", "ABCDEFGH23456789"])("accepts new and legacy code %s", async code => {
  expect((await handler(post({ code, name: "김" }))).status).toBe(200);
  expect(deps.rpc).toHaveBeenCalledOnce();
 });
 it("returns only receipts, never owner names or database fields", async () => {
  deps.rpc.mockResolvedValue({ participation: { ...receipt, name: "private" }, secret: "private" });
  const response = await handler(new Request(post().url));
  expect(await response.json()).toEqual({ participation: receipt });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
 });
 it("normalizes input, keeps names/codes out of RPC plaintext and stabilizes retry payload hashes", async () => {
  expect((await handler(post())).status).toBe(200);
  const first = deps.rpc.mock.calls[0][1];
  await handler(post());
  const second = deps.rpc.mock.calls[1][1];
  expect(first.p_payload_hmac).toBe(second.p_payload_hmac);
  expect(first.p_name_fingerprint).toBe(participationNameFingerprint("김가온", key));
  expect(first.p_name_fingerprint).toBe(second.p_name_fingerprint);
  expect(first.p_name_encrypted).not.toBe(second.p_name_encrypted);
  expect(JSON.stringify(first)).not.toContain("김가온");
  expect(JSON.stringify(first)).not.toContain("ABCDEFGH");
 });
 it.each([["PARTICIPATION_REVIEW_REQUIRED", 409], ["PARTICIPATION_CODE_INVALID", 400], ["PARTICIPATION_CLOSED", 410], ["PARTICIPATION_RATE_LIMITED", 429], ["PARTICIPATION_IDEMPOTENCY_CONFLICT", 409]])("maps returned %s safely", async (code, status) => {
  deps.rpc.mockResolvedValue({ error: { code } });
  const response = await handler(post());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code } });
 });
 it("rejects invalid payloads and bounded body before RPC", async () => {
  for (const request of [post({ code: "ABCDEFGH", name: "x".repeat(3000) }), post(undefined, "bad"), post({ code: "ABCDEFGH", name: "김", appUserId: id }), post({ code: "ABCDEFGH", name: "김", p_name_fingerprint: "a".repeat(64) })]) expect((await handler(request)).status).toBe(400);
  expect(deps.rpc).not.toHaveBeenCalled();
 });
 it("fails auth before data access and sanitizes all errors with no-store", async () => {
  deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "private identity"));
  const response = await handler(post());
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("private");
  expect(deps.rpc).not.toHaveBeenCalled();
 });
 it("loads the encryption key lazily and only fails this API when unavailable", async () => {
  const noKey = createParticipationHandler(deps, () => { throw new Error("private configuration"); });
  expect((await noKey(new Request(post().url))).status).toBe(200);
  expect((await noKey(post())).status).toBe(503);
 });
 it("allows only admin name decryption and paginates at 50 without leaking owner/ciphertext", async () => {
  const row = { ...receipt, appUserId: id, nameEncrypted: encryptParticipationName("김가온", id, key) };
  deps.rpc.mockResolvedValue(Array.from({ length: 51 }, () => row));
  const response = await admin(new Request("https://byus.kr/api/admin/kyaa-wave-participants"));
  const data = await response.json();
  expect(data.participants).toHaveLength(50);
  expect(data.participants[0]).toEqual({ ...receipt, name: "김가온", quizCorrectAt: null, bingoCompletedAt: null, stamps: [] });
  expect(data.nextCursor).toEqual(expect.any(String));
  expect(deps.rpc).toHaveBeenCalledWith("list_admin_kyaa_wave_participants", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_before_at: null, p_before_id: null });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
 });
 it("rejects caller actor/cursor injection and DB-revoked admin", async () => {
  expect((await admin(new Request("https://byus.kr/api/admin/kyaa-wave-participants?cursor=bad"))).status).toBe(400);
  expect(deps.rpc).not.toHaveBeenCalled();
  deps.rpc.mockRejectedValue(new Error("PARTICIPATION_ADMIN_FORBIDDEN"));
  expect((await admin(new Request("https://byus.kr/api/admin/kyaa-wave-participants"))).status).toBe(403);
 });
});
