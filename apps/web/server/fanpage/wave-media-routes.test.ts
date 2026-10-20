import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createWaveMediaHandlers } from "./wave-media-routes";
import { createWaveAlbumSchema } from "@/features/fanpage/domain/wave-media";
import { createFanClipSchema } from "@/server/mobile-content/domain";
import { reserveMediaSchema } from "@/server/mobile-media/domain";
const owner = "20000000-0000-4000-8000-000000000001";
const ids = Array.from({ length: 31 }, (_, i) => `20000000-0000-4000-8000-${String(i + 2).padStart(12, "0")}`);
const deps = () => ({ authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn().mockResolvedValue({ items: [], hasMore: false }) });
describe("Wave media contract", () => {
  it("accepts thirty ordered photos while ordinary clip writes stay at four", () => {
    expect(createWaveAlbumSchema.safeParse({ assetIds: ids.slice(0, 30), idempotencyKey: owner }).success).toBe(true);
    expect(createWaveAlbumSchema.safeParse({ assetIds: ids, idempotencyKey: owner }).success).toBe(false);
    expect(createWaveAlbumSchema.safeParse({ assetIds: [owner, owner], idempotencyKey: owner }).success).toBe(false);
    expect(createFanClipSchema.safeParse({ body: "", visibility: "public", assetIds: ids.slice(0, 5), idempotencyKey: owner }).success).toBe(false);
  });
  it("keeps fan posts image-only and Wave board video-only at reserve", () => {
    const input = { kind: "video", purpose: "wave_post", contentType: "video/mp4", byteSize: 10, requestId: owner };
    expect(reserveMediaSchema.safeParse(input).success).toBe(true);
    expect(reserveMediaSchema.safeParse({ ...input, purpose: "fan_post" }).success).toBe(false);
    expect(reserveMediaSchema.safeParse({ ...input, kind: "image", contentType: "image/webp" }).success).toBe(false);
    expect(reserveMediaSchema.safeParse({ ...input, purpose: "wave_album", kind: "image", contentType: "image/webp" }).success).toBe(true);
  });
  it("binds reads to authenticated viewer and profile, uses private cursor pages", async () => {
    const d = deps(); const response = await createWaveMediaHandlers(d).albums(new Request("https://kyaa.test/api/kyaa-wave/albums?limit=30"), owner);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(d.rpc).toHaveBeenCalledWith("read_kyaa_wave_albums", expect.objectContaining({ p_app_user_id: owner, p_profile_id: owner, p_limit: 30 }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects malformed and duplicate cursors before RPC", async () => {
    for (const query of ["cursor=bad", "limit=2&limit=4", "appUserId=other"]) {
      const d = deps(); expect((await createWaveMediaHandlers(d).albums(new Request(`https://kyaa.test/api/kyaa-wave/albums?${query}`))).status).toBe(400); expect(d.rpc).not.toHaveBeenCalled();
    }
  });
  it("creates an album through its dedicated reward-free RPC", async () => {
    const d = deps(); d.rpc.mockResolvedValue({ id: owner, revision: 1, replayed: false });
    const response = await createWaveMediaHandlers(d).albums(new Request("https://kyaa.test/api/kyaa-wave/albums", { method: "POST", body: JSON.stringify({ assetIds: ids.slice(0, 30), idempotencyKey: owner }) }));
    expect(response.status).toBe(201); expect(d.rpc).toHaveBeenCalledWith("create_kyaa_wave_album", expect.objectContaining({ p_body: "", p_app_user_id: owner, p_asset_ids: ids.slice(0, 30) }));
  });
});
