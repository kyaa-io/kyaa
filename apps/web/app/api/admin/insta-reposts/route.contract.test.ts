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
import { GET } from "./route";
it("reads the admin queue with the session's allowlist and the status filter", async () => {
  state.rpc.mockResolvedValueOnce({ items: [item] });
  const res = await GET(req("/api/admin/insta-reposts?status=pending"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ items: [item], hasMore: false });
  expect(state.rpc).toHaveBeenCalledWith("read_insta_repost_review_queue", { p_actor: MEMBER, p_allowlist: ADMIN.allowlistId, p_celebrity: null, p_status: "pending", p_before: null, p_limit: 50 });
  expect((await GET(req("/api/admin/insta-reposts?status=other"))).status).toBe(400);
});
