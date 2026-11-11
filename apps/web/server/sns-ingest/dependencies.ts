import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "../config/env";
import { createContentThumbnail, MAX_PUBLIC_IMAGE_BYTES, normalizePublicImage } from "../media/public-image-processing";
import { MEDIA_BUCKET } from "../mobile-media/domain";
import { createSnsIngestService } from "./service";

export async function fetchImage(url: URL): Promise<Uint8Array> {
  // Redirects could leave the allowed CDN hosts, so they are refused.
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000), headers: { accept: "image/*" } });
  if (!response.ok || !response.body) throw new Error("SNS_INGEST_IMAGE_UNAVAILABLE");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_PUBLIC_IMAGE_BYTES)) {
    await response.body.cancel();
    throw new Error("SNS_INGEST_IMAGE_TOO_LARGE");
  }
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_PUBLIC_IMAGE_BYTES) throw new Error("SNS_INGEST_IMAGE_TOO_LARGE");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function createSnsIngestDependencies() {
  const env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return createSnsIngestService({
    async rpc(name, args) {
      const { data, error } = await db.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    },
    fetchImage,
    async processImage(bytes) {
      const image = await normalizePublicImage(bytes);
      return { bytes: image.bytes, thumbnail: await createContentThumbnail(image.bytes), width: image.width, height: image.height, sha256: image.sha256 };
    },
    async upload(path, bytes) {
      const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: "image/webp", cacheControl: "0", upsert: false });
      if (error) throw new Error("SNS_INGEST_UPLOAD_FAILED");
    },
    now: () => new Date(),
  });
}
