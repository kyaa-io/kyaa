import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createContentThumbnail } from "../media/public-image-processing";

export function contentThumbnailPath(path: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)) throw new Error("FAN_WEB_UNAVAILABLE");
  return path.replace(/\.webp$/, ".thumbnail-240-v1.webp");
}

const conversions = new Map<string, Promise<Blob>>();

export async function readContentThumbnail(db: Pick<SupabaseClient, "storage" | "rpc">, path: string): Promise<Blob> {
  const pending = conversions.get(path);
  if (pending) return pending;
  const conversion = loadContentThumbnail(db, path);
  conversions.set(path, conversion);
  try { return await conversion; }
  finally { conversions.delete(path); }
}

async function loadContentThumbnail(db: Pick<SupabaseClient, "storage" | "rpc">, path: string): Promise<Blob> {
  const storage = db.storage.from("fan-content-assets"), variant = contentThumbnailPath(path);
  const stored = await storage.download(variant);
  if (stored.data && !stored.error) return stored.data;
  if (String((stored.error as { statusCode?: string } | null)?.statusCode) !== "404") throw new Error("FAN_WEB_UNAVAILABLE");
  const lease = await db.rpc("begin_content_thumbnail_upload", { p_storage_path: path });
  if (!lease.error && lease.data === -1) {
    // Another server owns conversion; wait briefly for its stored result without reading the original again.
    for (const delay of [50, 100, 200, 400, 800, 1600]) {
      await new Promise(resolve => setTimeout(resolve, delay));
      const ready = await storage.download(variant);
      if (ready.data && !ready.error) return ready.data;
      if (String((ready.error as { statusCode?: string } | null)?.statusCode) !== "404") throw new Error("FAN_WEB_UNAVAILABLE");
    }
    throw new Error("FAN_WEB_UNAVAILABLE");
  }
  if (lease.error || typeof lease.data !== "number") throw new Error("FAN_WEB_UNAVAILABLE");
  let succeeded = false;
  try {
    const original = await storage.download(path);
    if (original.error || !original.data) throw new Error("FAN_WEB_UNAVAILABLE");
    const bytes = await createContentThumbnail(new Uint8Array(await original.data.arrayBuffer()));
    const uploaded = await storage.upload(variant, bytes, { contentType: "image/webp", cacheControl: "0", upsert: true });
    if (uploaded.error) throw new Error("FAN_WEB_UNAVAILABLE");
    succeeded = true;
    return new Blob([bytes], { type: "image/webp" });
  } finally {
    const settled = await db.rpc("settle_content_thumbnail_upload", { p_storage_path: path, p_generation: lease.data, p_succeeded: succeeded });
    if (settled.error || settled.data !== true) throw new Error("FAN_WEB_UNAVAILABLE");
  }
}
