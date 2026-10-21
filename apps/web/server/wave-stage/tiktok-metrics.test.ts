import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { waveStageTikTokResponseSchema } from "@/features/wave-stage/domain/tiktok-metrics";
import { createWaveStageTikTokHandler } from "./tiktok-metrics";

const observedAt = "2026-10-21T00:00:00.000Z";
const roomId = "7698808886958721812";
const request = new Request("https://byus.test/api/admin/wave-stage/tiktok?handle=attacker", { headers: { authorization: "Bearer test" } });
const live = { state: "live", observedAt, roomId, viewers: 17, title: "private source title", thumbnailUrl: null };
function setup() {
  const deps = { authorizeAdmin: vi.fn().mockResolvedValue({ role: "viewer" }) };
  const observe = vi.fn().mockResolvedValue(live);
  return { deps, observe, handler: createWaveStageTikTokHandler(deps, { observe, now: () => new Date(observedAt) }) };
}

describe("Wave stage TikTok admin metrics", () => {
  it("authenticates before fetching and reads only the two allowlisted identities", async () => {
    const { deps, observe, handler } = setup();
    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.authorizeAdmin).toHaveBeenCalledWith("Bearer test", expect.any(String));
    expect(deps.authorizeAdmin.mock.invocationCallOrder[0]).toBeLessThan(observe.mock.invocationCallOrder[0]!);
    expect(observe.mock.calls).toEqual([["chang._.a"], ["wena_official_"]]);
    expect(await response.json()).toEqual({ asOf: observedAt, creators: [
      { slug: "changha", state: "live", observedAt, roomId, viewers: 17 },
      { slug: "wena", state: "live", observedAt, roomId, viewers: 17 },
    ] });
  });
  it("never fetches on rejected authentication and does not expose errors", async () => {
    const { deps, observe, handler } = setup();
    for (const error of [new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"), new Error("private credential")]) {
      deps.authorizeAdmin.mockRejectedValue(error);
      const response = await handler(request);
      expect(response.status).toBe(error instanceof AuthError ? 401 : 503);
      expect(JSON.stringify(await response.json())).not.toContain("private credential");
    }
    expect(observe).not.toHaveBeenCalled();
  });
  it("preserves one creator on source failure and omits stale offline counts", async () => {
    const { observe, handler } = setup();
    observe.mockRejectedValueOnce(new Error("source secret")).mockResolvedValueOnce({ ...live, state: "offline", viewers: 5164 });
    const response = await handler(request);
    expect(await response.json()).toEqual({ asOf: observedAt, creators: [
      { slug: "changha", state: "unavailable", observedAt }, { slug: "wena", state: "offline", observedAt },
    ] });
  });
  it("withholds live identity on malformed observations instead of fabricating zero", async () => {
    const { observe, handler } = setup();
    observe.mockResolvedValueOnce({ ...live, roomId: undefined }).mockResolvedValueOnce({ ...live, viewers: null });
    const body = await (await handler(request)).json();
    expect(body.creators[0]).toEqual({ slug: "changha", state: "unavailable", observedAt });
    expect(body.creators[1]).toMatchObject({ state: "live", viewers: null });
    expect(waveStageTikTokResponseSchema.safeParse({ ...body, privateField: "hidden" }).success).toBe(false);
    expect(waveStageTikTokResponseSchema.safeParse({ ...body, creators: [{ ...body.creators[0], viewers: 0 }, body.creators[1]] }).success).toBe(false);
  });
});
