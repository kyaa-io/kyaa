import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), authorizeAdmin: vi.fn(), stream: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc: state.rpc, authorize: state.authorize, authorizeAdmin: state.authorizeAdmin }) }));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn(async (slug: string) => slug === "elina" ? "22222222-2222-4222-8222-222222222222" : null) }));
vi.mock("@/server/mobile-media/processor-runtime", () => ({ createMediaProcessorRuntime: () => ({ storage: {} }) }));
vi.mock("@/server/storage/transport", () => ({ storageObjectResponse: (...args: unknown[]) => state.stream(...args) }));
const MEMBER = "11111111-1111-4111-8111-111111111111", ID = "33333333-3333-4333-8333-333333333333", PAGE = "55555555-5555-4555-8555-555555555555";
const ADMIN = { email: "a@byus.test", role: "admin", appUserId: MEMBER, allowlistId: "66666666-6666-4666-8666-666666666666" };
const req = (path: string, body?: unknown) => new Request(`https://byus.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer valid" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const item = { id: ID, submittedAt: "2026-11-09T10:00:00+09:00", status: "pending", postKind: "feed", url: "https://www.instagram.com/p/C1aBc_D-2xY/", hasCapture: false, revision: 0,
  creator: { slug: "elina", name: "엘리나" }, member: { id: MEMBER, nickname: null }, duplicateCount: 0, rejectCode: null, reviewedAt: null, reviewerRole: null, payResult: null,
  points: null, approvedAt: null, clawedBack: false, revokedAt: null, revokeResult: null };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); state.authorizeAdmin.mockResolvedValue(ADMIN); });
void item; void PAGE; void ADMIN;
import { GET, POST } from "./route";
it("submits a checked feed address and answers 201, a repeat 200", async () => {
  state.rpc.mockResolvedValueOnce({ id: ID, status: "pending", replayed: false, duplicate: false });
  const res = await POST(req("/api/me/insta-reposts", { creator: "elina", postKind: "feed", url: "https://www.instagram.com/p/C1aBc_D-2xY/?igsh=1", ownPost: true }));
  expect(res.status).toBe(201);
  expect(state.rpc).toHaveBeenCalledWith("submit_fan_insta_repost", expect.objectContaining({ p_user: MEMBER, p_url_key: "instagram:C1aBc_D-2xY", p_post_kind: "feed" }));
  state.rpc.mockResolvedValueOnce({ id: ID, status: "pending", replayed: true, duplicate: true });
  expect((await POST(req("/api/me/insta-reposts", { creator: "elina", postKind: "reel", url: "https://www.instagram.com/reel/C1aBc_D-2xY/", ownPost: true }))).status).toBe(200);
});
it("refuses a non-Instagram address before the database and maps database refusals", async () => {
  const res = await POST(req("/api/me/insta-reposts", { creator: "elina", postKind: "feed", url: "https://x.com/fan/status/1850000000000000001", ownPost: true }));
  expect(res.status).toBe(422);
  expect(state.rpc).not.toHaveBeenCalled();
  state.rpc.mockRejectedValueOnce(new Error("POLICY_INACTIVE"));
  expect((await POST(req("/api/me/insta-reposts", { creator: "elina", postKind: "feed", url: "https://www.instagram.com/p/C1aBc_D-2xY/", ownPost: true }))).status).toBe(409);
});
it("lists the member's reposts of a creator", async () => {
  state.rpc.mockResolvedValueOnce({ items: [] });
  const res = await GET(req("/api/me/insta-reposts?creator=elina"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ items: [] });
  expect((await GET(req("/api/me/insta-reposts?creator=nobody"))).status).toBe(404);
});
