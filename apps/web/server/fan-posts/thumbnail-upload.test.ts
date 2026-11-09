import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn() }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ storage: { from: () => ({ upload: f.upload }) } }) }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc: f.rpc }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({}) }));
vi.mock("@/server/content-translation/google-translate", () => ({ translateText: vi.fn(), translateTexts: vi.fn() }));
vi.mock("@/server/media/public-image-processing", () => ({ normalizePublicImage: async () => ({ bytes: new Uint8Array([1]), width: 1, height: 1, sha256: "hash" }), createContentThumbnail: async () => new Uint8Array([2]) }));
import { createContentDependencies } from "./dependencies";
import { NoticeRepository } from "../notice/notice-repository";
const owner = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333";
it("abandons fan upload if the second file fails and never finishes", async () => {
  f.rpc.mockReset().mockResolvedValue({ id, storagePath: `${owner}/${id}.webp` });
  f.upload.mockReset().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "failed" } });
  await expect(createContentDependencies().upload(owner, "artist", new Uint8Array([1]))).rejects.toThrow();
  expect(f.upload).toHaveBeenCalledTimes(2);
  expect(f.rpc).toHaveBeenLastCalledWith("abandon_content_asset_upload", { p_app_user_id: owner, p_asset_id: id });
  expect(f.rpc.mock.calls.some(([name]) => name === "finish_content_asset_upload")).toBe(false);
});
it("abandons admin upload if the second file fails and never finishes", async () => {
  f.rpc.mockReset().mockResolvedValue({ data: { id, storagePath: `${owner}/${id}.webp` }, error: null });
  f.upload.mockReset().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "failed" } });
  const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: { id }, error: null }) };
  const repo = new NoticeRepository({ from: () => query, rpc: f.rpc, storage: { from: () => ({ upload: f.upload }) } } as never);
  await expect(repo.upload({ role: "admin", appUserId: owner, allowlistId: id } as never, { celebrityId: id, noticeId: id, file: { type: "image/webp", size: 1, arrayBuffer: async () => new ArrayBuffer(1) } as File })).rejects.toThrow();
  expect(f.upload).toHaveBeenCalledTimes(2);
  expect(f.rpc).toHaveBeenLastCalledWith("abandon_content_asset_upload", { p_app_user_id: owner, p_asset_id: id });
  expect(f.rpc.mock.calls.some(([name]) => name === "finish_content_asset_upload")).toBe(false);
});
