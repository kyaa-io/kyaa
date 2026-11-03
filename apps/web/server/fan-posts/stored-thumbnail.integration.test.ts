import { Blob } from "node:buffer";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import * as processing from "../media/public-image-processing";
import { contentThumbnailPath, readContentThumbnail } from "./stored-thumbnail";

it("persists a real Sharp thumbnail once, then repeats three reads without original GETs or image processing", async () => {
  const path = "22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp";
  const source = await sharp({ create: { width: 480, height: 240, channels: 3, background: "#123456" } }).webp().toBuffer();
  const files = new Map([[path, new Blob([new Uint8Array(source)])]]);
  const download = vi.fn(async (name: string) => files.has(name) ? { data: files.get(name), error: null } : { data: null, error: { statusCode: "404" } });
  const upload = vi.fn(async (name: string, bytes: Uint8Array) => { files.set(name, new Blob([new Uint8Array(bytes)])); return { error: null }; });
  const rpc = vi.fn(async (name: string) => ({ data: name.startsWith("begin") ? 1 : true, error: null }));
  const db = { storage: { from: () => ({ download, upload }) }, rpc } as unknown as SupabaseClient;
  const transform = vi.spyOn(processing, "createContentThumbnail");
  try {
    const first = await readContentThumbnail(db, path);
    expect(download.mock.calls.filter(([name]) => name === path)).toHaveLength(1);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(await sharp(new Uint8Array(await first.arrayBuffer())).metadata()).toMatchObject({ format: "webp", width: 240, height: 120 });
    download.mockClear(); transform.mockClear();
    for (let i = 0; i < 3; i++) await readContentThumbnail(db, path);
    expect(download.mock.calls).toEqual(Array(3).fill([contentThumbnailPath(path)]));
    expect(transform).not.toHaveBeenCalled(); expect(upload).toHaveBeenCalledTimes(1);
  } finally { transform.mockRestore(); }
});
