import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { factory, authorize, rpc } = vi.hoisted(() => ({ factory: vi.fn(), authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: factory }));
import { GET as list } from "@/app/api/groups/[id]/earnings/route";
import { GET as detail } from "@/app/api/groups/[id]/earnings/[entryKey]/route";
import { AuthError } from "@/features/auth/domain/auth-errors";
const owner = "11111111-1111-4111-8111-111111111111";
const page = "22222222-2222-4222-8222-222222222222";
const entryKey = "mission:33333333-3333-4333-8333-333333333333";
const request = () => new Request(`https://fixture.test/api/groups/${page}/earnings`, { headers: { authorization: "Bearer fixture" } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("KYAA_GROUPS_ENABLED", "true");
  factory.mockReturnValue({ authorize, rpc });
  authorize.mockResolvedValue({ appUserId: owner });
  rpc.mockResolvedValue({ entries: [], nextCursor: null });
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("Next group earnings read routes", () => {
  it.each(["false", ""])("gates disabled groups (%s) before creating credentialed dependencies", async flag => {
    vi.stubEnv("KYAA_GROUPS_ENABLED", flag);
    const response = await list(request(), { params: Promise.resolve({ id: page }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(factory).not.toHaveBeenCalled();
  });
  it("wires the list params, auth and read RPC", async () => {
    const response = await list(request(), { params: Promise.resolve({ id: page }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [], nextCursor: null });
    expect(authorize).toHaveBeenCalledWith("Bearer fixture");
    expect(rpc).toHaveBeenCalledWith("read_owned_group_earnings", { p_actor: owner, p_page_id: page, p_limit: 30, p_cursor: null });
  });
  it("wires the detail key without exposing upstream failure text", async () => {
    rpc.mockRejectedValue(new Error("GROUP_EARNINGS_NOT_FOUND private owner information"));
    const response = await detail(request(), { params: Promise.resolve({ id: page, entryKey }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "GROUP_EARNINGS_NOT_FOUND" } });
    expect(rpc).toHaveBeenCalledWith("read_owned_group_earning", { p_actor: owner, p_page_id: page, p_entry_key: entryKey });
  });
  it("redacts dependency construction failures", async () => {
    factory.mockImplementation(() => { throw new Error("private database configuration"); });
    const response = await list(request(), { params: Promise.resolve({ id: page }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "GROUP_EARNINGS_UNAVAILABLE" } });
  });
  it("preserves forbidden auth failures with no read fallback", async () => {
    authorize.mockRejectedValue(new AuthError("VERIFIED_EMAIL_REQUIRED", 403, "Private restriction"));
    const response = await list(request(), { params: Promise.resolve({ id: page }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "FORBIDDEN" } });
    expect(rpc).not.toHaveBeenCalled();
  });
});
