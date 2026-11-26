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
  const response = await post({ action:"start", game:"match", key:id, character:"elina", extra:true, expectedCost:300, p_user:"ignored" });
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenNthCalledWith(1,"chemi_issue_play", {
    p_user:id, p_request_key:id, p_game:"match", p_character:"elina", p_extra:true, p_expected_cost:300,
  });
});

it("does not persist unverified client scores", async () => {
  rpc.mockResolvedValue({ playId:id, seed:42, issuedAt:new Date(Date.now()-65000).toISOString() });
  expect((await post({ action:"finish", playId:id, ticks:3600, score:5, moves:[] })).status).toBe(422);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("returns the pre-start ranking without viewer or friend identity", async () => {
  rpc.mockImplementation(async (name: string) => name === "chemi_game_players" ? { total: 12, week: 3 } : []);
  const response = await post({ action: "ranking", p_viewer:id }, false);
  expect(await response.json()).toEqual({ ranking:[], players:{ total:12, week:3 } });
  expect(rpc).toHaveBeenCalledWith("chemi_game_players", { p_game:"match" });
  expect(authorize).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("chemi_match_ranking", { p_viewer:null, p_friend:null });
});

it("still answers the ranking when the participant count cannot be read", async () => {
  rpc.mockImplementation(async (name: string) => { if (name === "chemi_game_players") throw new Error("missing"); return []; });
  const response = await post({ action: "ranking" }, false);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ranking:[], players:null });
});

it("uses the authenticated viewer for a personal rank", async () => {
  rpc.mockResolvedValue([]);
  const response = await post({ action: "ranking", p_viewer: "ignored" });
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("chemi_match_ranking", { p_viewer: id, p_friend: null });
});

it("stores a run only at the score its presses replay to", async () => {
  const { play } = await import("@/features/chemi/games/run-bot");
  const { sim, inputs } = play(42, 600);
  const { tick: ticks, score } = sim.state;
  const run = (body: object) => POST(new Request("https://example.test/api/chemi/games?game=run", {
    method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer fixture", "content-type": "application/json" },
  }));
  rpc.mockResolvedValue({ playId: id, seed: 42, issuedAt: new Date(Date.now() - 15000).toISOString() });
  expect((await run({ action: "finish", playId: id, ticks, score: score + 1, inputs, moves: [] })).status).toBe(422);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect((await run({ action: "finish", playId: id, ticks, score, inputs, moves: [] })).status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith("chemi_run_finish", { p_user: id, p_play: id, p_score: score, p_log: { ticks, inputs } });
});

it("cancels an unseen play by its start key for the signed-in owner only", async () => {
  rpc.mockResolvedValue({ refunded: true });
  const response = await post({ action: "cancel", key: id, p_user: "ignored" });
  expect(await response.json()).toEqual({ refunded: true });
  expect(rpc).toHaveBeenCalledWith("chemi_cancel_play", { p_user: id, p_game: "match", p_request_key: id });
  expect((await post({ action: "cancel" })).status).toBe(400);
});

it("recovers an issued paid run by the original key after ticket lookup fails", async () => {
  const body = { action: "start", game: "run", character: "elina", key: id, extra: true, expectedCost: 100 };
  const issued = { playId: id, seed: 42, issuedAt: new Date().toISOString(), status: "issued" };
  const start = () => POST(new Request("https://example.test/api/chemi/games?game=run", {
    method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer fixture", "content-type": "application/json" },
  }));
  rpc.mockResolvedValueOnce({ playId: id, replayed: false })
    .mockRejectedValueOnce(new Error("CHEMI_UNAVAILABLE"))
    .mockResolvedValueOnce({ playId: id, replayed: true })
    .mockResolvedValueOnce(issued);
  const failure = await start();
  expect(failure.status).toBe(503);
  expect(await failure.json()).toEqual({ error: "CHEMI_RUN_START_RETRY" });
  expect(await (await start()).json()).toEqual(issued);
  expect(rpc.mock.calls.slice(2)).toEqual(rpc.mock.calls.slice(0, 2));
});
