import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { enabled, authorize, rpc } = vi.hoisted(() => ({
  enabled: vi.fn(), authorize: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/features/chemi/domain/availability", () => ({ chemiEnabled: enabled }));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ authorize, rpc }),
}));
import { POST } from "./route";

const id = "a57e30ef-79dd-490b-87ba-5fe49e5e9712";
function post(body: unknown, signedIn = true) {
  return POST(new Request("https://example.test/api/chemi/games", {
    method: "POST", body: JSON.stringify(body), headers: { ...(signedIn ? { authorization: "Bearer fixture" } : {}), "content-type": "application/json" },
  }));
}
beforeEach(() => {
  vi.resetAllMocks();
  enabled.mockReturnValue({});
  authorize.mockResolvedValue({ appUserId: id });
});

it("closes the API before any mutation when the entry page is held", async () => {
  enabled.mockReturnValue(null);
  expect((await post({ action: "start", game: "match", character:"elina", key:id, extra:true })).status).toBe(404);
  expect(authorize).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it("binds trial retries to the same request key without requiring member authentication", async () => {
  const shareId = "a".repeat(32);
  rpc.mockResolvedValue({ playId: id });
  expect((await post({ action: "trial", shareId, key: id })).status).toBe(200);
  expect(authorize).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("chemi_match_challenge", { p_key:id, p_share:shareId });
  expect((await post({ action: "trial", shareId })).status).toBe(400);
});

it("binds paid slot issuance to the authenticated owner and supplied idempotency key", async () => {
  rpc.mockResolvedValueOnce({ playId:id }).mockResolvedValueOnce({ playId:id, seed:42, status:"issued" });
  const response = await post({ action:"start", game:"match", key:id, character:"elina", extra:true, p_user:"ignored" });
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenNthCalledWith(1,"chemi_issue_play", {
    p_user:id, p_request_key:id, p_game:"match", p_character:"elina", p_extra:true,
  });
});

it("does not persist unverified client scores", async () => {
  rpc.mockResolvedValue({ playId:id, seed:42, issuedAt:new Date(Date.now()-65000).toISOString() });
  expect((await post({ action:"finish", playId:id, ticks:3600, score:5, moves:[] })).status).toBe(422);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("returns the pre-start ranking without viewer or friend identity", async () => {
  rpc.mockResolvedValue([]);
  const response = await post({ action: "ranking", p_viewer:id }, false);
  expect(await response.json()).toEqual({ ranking:[] });
  expect(authorize).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("chemi_match_ranking", { p_viewer:null, p_friend:null });
});

it("uses the authenticated viewer for a personal rank", async () => {
  rpc.mockResolvedValue([]);
  const response = await post({ action: "ranking", p_viewer: "ignored" });
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("chemi_match_ranking", { p_viewer: id, p_friend: null });
});
