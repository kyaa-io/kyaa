import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "../../features/auth/domain/auth-errors";
import { createChannelAssetHandler } from "./channel-asset";

const CH_A = "10000000-0000-4000-8000-00000000000a";
const CH_B = "10000000-0000-4000-8000-00000000000b";
const ASSET = "30000000-0000-4000-8000-000000000001";
const PATH = `${CH_A}/${ASSET}.webp`;
const session = { kind: "operator", role: "operator", appUserId: "u", allowlistId: null, channelIds: [CH_A] } as never;

function build(overrides: { readAsset?: ReturnType<typeof vi.fn> } = {}) {
  const readAsset = overrides.readAsset ?? vi.fn(async (_s: unknown, channel: string) => (channel === CH_A ? { storagePath: PATH, mimeType: "image/webp" } : null));
  const download = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const authorize = vi.fn(async (authorization: string | null, _c: string, channel: string) => {
    if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "x");
    if (channel !== CH_A) throw new AuthError("CHANNEL_OPERATOR_REQUIRED", 403, "x");
    return session;
  });
  return { get: createChannelAssetHandler({ authorize, readAsset: readAsset as never, download }), readAsset, download };
}
const req = (token: string | null, query = "") => new Request(`https://byus.test/api/operator/channels/x/assets/y${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("operator channel asset preview", () => {
  it("returns the image bytes for an asset of the authenticated channel", async () => {
    const { get, download } = build();
    const response = await get(req("t"), CH_A, ASSET);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(download).toHaveBeenCalledWith(PATH);
  });

  it("returns 403 for an operator of another channel before any read", async () => {
    const { get, readAsset, download } = build();
    const response = await get(req("t"), CH_B, ASSET);
    expect(response.status).toBe(403);
    expect(readAsset).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("returns 403 when the asset belongs to a different channel than the one requested", async () => {
    const { get, download } = build({ readAsset: vi.fn(async () => null) });
    const response = await get(req("t"), CH_A, ASSET);
    expect(response.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("returns 403 when the database rejects a non-operator", async () => {
    const { get } = build({ readAsset: vi.fn(async () => { throw new Error("active channel operator required"); }) });
    expect((await get(req("t"), CH_A, ASSET)).status).toBe(403);
  });

  it("returns 401 without a token and 400 for a query string or bad id", async () => {
    const { get, readAsset } = build();
    expect((await get(req(null), CH_A, ASSET)).status).toBe(401);
    expect((await get(req("t", "?x=1"), CH_A, ASSET)).status).toBe(400);
    expect((await get(req("t"), CH_A, "not-a-uuid")).status).toBe(400);
    expect(readAsset).not.toHaveBeenCalled();
  });
});
