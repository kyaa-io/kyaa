import { Blob } from "node:buffer";
import { expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
vi.mock("../media/public-image-processing", () => ({ createContentThumbnail: vi.fn(async () => new Uint8Array([2])) }));
import { createContentThumbnail } from "../media/public-image-processing";
import { readContentThumbnail, contentThumbnailPath } from "./stored-thumbnail";
const path = "22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp";
beforeEach(() => vi.clearAllMocks());
function fixture(status = "404") {
  const files = new Map([[path, new Blob([new Uint8Array([1])])]]);
  const download = vi.fn(async (name: string) => files.has(name) ? { data: files.get(name)!, error: null } : { data: null, error: { statusCode: status } });
  const upload = vi.fn(async (name: string, bytes: Uint8Array) => { files.set(name, new Blob([new Uint8Array(bytes)])); return { error: null }; });
  const rpc = vi.fn(async (name: string) => ({ data: name.startsWith("begin") ? 1 : true, error: null }));
  return { db: { storage: { from: () => ({ download, upload }) }, rpc } as unknown as SupabaseClient, download, upload, rpc };
}
it("converts a legacy original once and uses only persisted variants for three repeat reads", async () => {
  const f = fixture();
  await readContentThumbnail(f.db, path);
  expect(f.download.mock.calls.filter(([name]) => name === path)).toHaveLength(1);
  expect(createContentThumbnail).toHaveBeenCalledTimes(1);
  f.download.mockClear(); vi.mocked(createContentThumbnail).mockClear();
  for (let i = 0; i < 3; i++) await readContentThumbnail(f.db, path);
  expect(f.download.mock.calls).toEqual(Array(3).fill([contentThumbnailPath(path)]));
  expect(createContentThumbnail).not.toHaveBeenCalled();
  expect(f.upload).toHaveBeenCalledTimes(1);
});
it.each(["503", "403", "429"])("does not fetch or convert the original on storage %s", async status => {
  const f = fixture(status);
  await expect(readContentThumbnail(f.db, path)).rejects.toThrow();
  expect(f.download).toHaveBeenCalledTimes(1); expect(f.rpc).not.toHaveBeenCalled(); expect(createContentThumbnail).not.toHaveBeenCalled();
});
it("settles failed conversion without abandoning or deleting the live original", async () => {
  const f = fixture(); f.upload.mockRejectedValueOnce(new Error("unavailable"));
  await expect(readContentThumbnail(f.db, path)).rejects.toThrow();
  expect(f.rpc).toHaveBeenLastCalledWith("settle_content_thumbnail_upload", { p_storage_path: path, p_generation: 1, p_succeeded: false });
});
it("rejects stale or deleted-parent settlement", async () => {
  const f = fixture(); f.rpc.mockResolvedValueOnce({ data: 1, error: null }).mockResolvedValueOnce({ data: false, error: null } as never);
  await expect(readContentThumbnail(f.db, path)).rejects.toThrow();
});
it("rejects arbitrary paths", () => { expect(() => contentThumbnailPath("../original.webp")).toThrow(); });
it("coalesces simultaneous first reads into one stored conversion", async () => {
  const f = fixture();
  const values = await Promise.all([readContentThumbnail(f.db, path), readContentThumbnail(f.db, path), readContentThumbnail(f.db, path)]);
  expect(values).toHaveLength(3); expect(f.upload).toHaveBeenCalledTimes(1);
  expect(f.rpc.mock.calls.filter(([name]) => name.startsWith("begin"))).toHaveLength(1);
  expect(f.download.mock.calls.filter(([name]) => name === path)).toHaveLength(1);
});
it("waits for another process's busy lease using only stored-variant reads", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ data: -1, error: null });
  f.download.mockResolvedValueOnce({ data: null, error: { statusCode: "404" } }).mockResolvedValueOnce({ data: new Blob([new Uint8Array([2])]), error: null });
  try {
    const result = readContentThumbnail(f.db, path);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBeInstanceOf(Blob);
    expect(f.download.mock.calls).toEqual([[contentThumbnailPath(path)], [contentThumbnailPath(path)]]);
    expect(createContentThumbnail).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
it("does not retry a failed begin RPC as if it were a busy lease", async () => {
  const f = fixture(); f.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } } as never);
  await expect(readContentThumbnail(f.db, path)).rejects.toThrow();
  expect(f.download).toHaveBeenCalledTimes(1); expect(f.rpc).toHaveBeenCalledTimes(1);
});
it("bounds busy-lease retries without original reads or Sharp work", async () => {
  vi.useFakeTimers();
  const f = fixture(); f.rpc.mockResolvedValueOnce({ data: -1, error: null });
  try {
    const pending = expect(readContentThumbnail(f.db, path)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3150); await pending;
    expect(f.download).toHaveBeenCalledTimes(7);
    expect(f.download.mock.calls.every(([name]) => name === contentThumbnailPath(path))).toBe(true);
    expect(createContentThumbnail).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
