import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { waveStagePresentationResponseSchema } from "@/features/wave-stage/domain/presentation";
import { createWaveStagePresentationHandler } from "./presentation";

const id = "91900000-0000-4000-8000-000000000001";
const fixture = () => ({
  asOf: "2026-10-22T04:00:00Z", scope: "all", from: null, to: "2026-10-22T04:00:00Z", eventDate: "2026-10-22",
  creators: ["changha", "wena"].map((slug) => ({ slug, name: slug, reservations: 1, passports: 1, likes: 1, comments: 2, engagedFans: 2, pending: 5, failed: 0 })),
  onchain: { state: "unavailable" },
});
const request = (query = "") => new Request(`https://byus.test/api/admin/wave-stage/presentation${query}`, { headers: { authorization: "Bearer test", "x-correlation-id": id } });
function setup() {
  const deps = { authorizeAdmin: vi.fn().mockResolvedValue({ appUserId: id, allowlistId: id, role: "viewer" }), rpc: vi.fn().mockResolvedValue(fixture()) };
  return { deps, read: createWaveStagePresentationHandler(deps) };
}
describe("Wave presentation read", () => {
  it("authorizes viewer reads and defaults to all with a private response", async () => {
    const { deps, read } = setup();
    const response = await read(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fixture());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.rpc).toHaveBeenCalledWith("read_admin_wave_stage_participation", { p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_scope: "all" });
  });
  it("passes event-day scope and validates its KST half-open window", async () => {
    const { deps, read } = setup();
    const value = { ...fixture(), scope: "event-day", from: "2026-10-21T15:00:00Z" };
    deps.rpc.mockResolvedValue(value);
    expect((await read(request("?scope=event-day"))).status).toBe(200);
    deps.rpc.mockResolvedValue({ ...value, asOf: "2026-10-23T00:00:00Z", to: "2026-10-22T15:00:00Z" });
    expect((await read(request("?scope=event-day"))).status).toBe(200);
    deps.rpc.mockResolvedValue({ ...value, from: "2026-10-22T00:00:00Z" });
    expect((await read(request("?scope=event-day"))).status).toBe(503);
  });
  it("rejects unknown, duplicate and unrequested scopes before RPC", async () => {
    const { deps, read } = setup();
    for (const query of ["?scope=today", "?scope=", "?scope=all&scope=event-day", "?userId=private"]) expect((await read(request(query))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("does no work for unauthenticated requests", async () => {
    const { deps, read } = setup();
    deps.authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    expect((await read(request())).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("fails closed for private fields, incomplete targets, wrong scope or unsafe counts", async () => {
    const { deps, read } = setup();
    for (const value of [
      { ...fixture(), appUserId: id },
      { ...fixture(), creators: [fixture().creators[0]] },
      { ...fixture(), scope: "event-day", from: "2026-10-21T15:00:00Z" },
      { ...fixture(), onchain: { state: "available", creators: [] } },
      { ...fixture(), creators: fixture().creators.map((c) => ({ ...c, likes: Number.MAX_SAFE_INTEGER + 1 })) },
    ]) {
      deps.rpc.mockResolvedValue(value);
      expect((await read(request())).status).toBe(503);
    }
  });
  it("rejects incoherent bounds and unverified chain values without exposing RPC data", () => {
    expect(waveStagePresentationResponseSchema.safeParse({ ...fixture(), creators: [] }).success).toBe(false);
    expect(waveStagePresentationResponseSchema.safeParse({ ...fixture(), to: "2026-10-23T00:00:00Z" }).success).toBe(false);
    const onchain = { state: "available", contractAddress: `0x${"a".repeat(40)}`, blockNumber: "100", blockHash: `0x${"b".repeat(64)}`, observedAt: fixture().asOf, finality: "finalized", finalizedBlockNumber: "100", creators: fixture().creators.map(({ slug, reservations, passports, likes, comments, engagedFans }) => ({ slug, reservations, passports, likes, comments, engagedFans })) };
    expect(waveStagePresentationResponseSchema.safeParse({ ...fixture(), onchain }).success).toBe(true);
    expect(waveStagePresentationResponseSchema.safeParse({ ...fixture(), onchain: { ...onchain, finality: "pending" } }).success).toBe(false);
    expect(waveStagePresentationResponseSchema.safeParse({ ...fixture(), onchain: { ...onchain, creators: [onchain.creators[0], onchain.creators[0]] } }).success).toBe(false);
  });
});
