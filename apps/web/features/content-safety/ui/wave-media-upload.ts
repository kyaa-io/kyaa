import { z } from "zod";
import { ownedMediaSchema, type OwnedMedia } from "@/server/mobile-media/domain";

export type WaveUpload = { key: string; file: File; assetId?: string; uploaded?: boolean; media?: OwnedMedia; failed?: boolean };
const reservationSchema = z.object({ assetId: z.uuid(), uploadUrl: z.url(), uploadToken: z.string(), expiresAt: z.string(), replayed: z.boolean() });
export async function cancelWaveUpload(task: WaveUpload, getToken: () => Promise<string | null>) {
  if (!task.assetId) return;
  const token = await getToken();
  if (token) await fetch(`/api/me/media/uploads/${task.assetId}`, { method: "DELETE", credentials: "omit", keepalive: true, headers: { Authorization: `Bearer ${token}` } });
}
export function validWaveFiles(files: File[], existing: WaveUpload[], photoLimit = 30) {
  const all = [...existing.map(item => item.file), ...files], videos = all.filter(file => file.type.startsWith("video/"));
  return all.length > 0 && (videos.length ? all.length === 1 : all.length <= photoLimit)
    && all.every(file => file.size > 0 && (file.type === "video/mp4" || file.type === "video/quicktime" ? file.size <= 50 * 1024 * 1024 : ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024));
}
/** The same task retains its request ID, uploaded bytes and asset across retries. */
export async function uploadWaveMedia(task: WaveUpload, purpose: "wave_album" | "wave_post", getToken: () => Promise<string | null>, signal: AbortSignal): Promise<OwnedMedia> {
  async function request(path: string, method = "GET", body?: unknown) {
    const token = await getToken(); signal.throwIfAborted(); if (!token) throw new Error("AUTHENTICATION_REQUIRED");
    const response = await fetch(path, { method, signal, cache: "no-store", credentials: "omit", headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error("MEDIA_UNAVAILABLE");
    return response.json();
  }
  if (task.media?.state === "ready") return task.media;
  if (!task.uploaded) {
    const reserved = reservationSchema.parse(await request("/api/me/media/uploads", "POST", { kind: task.file.type.startsWith("video/") ? "video" : "image", purpose, contentType: task.file.type, byteSize: task.file.size, requestId: task.key }));
    task.assetId = reserved.assetId;
    const response = await fetch(reserved.uploadUrl, { method: "PUT", signal, credentials: "omit", headers: { "content-type": task.file.type, "x-upsert": "false", ...(reserved.uploadToken.startsWith("s3.") ? { "if-none-match": "*" } : {}) }, body: task.file });
    if (!response.ok && response.status !== 409 && response.status !== 412) throw new Error("MEDIA_UPLOAD_FAILED");
    task.uploaded = true;
  }
  task.media = ownedMediaSchema.parse(await request(`/api/me/media/uploads/${task.assetId}/complete`, "POST"));
  for (let attempt = 0; task.media.state !== "ready"; attempt++) {
    if (["rejected", "cancelled"].includes(task.media.state) || attempt >= 60) throw new Error("MEDIA_NOT_READY");
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    task.media = ownedMediaSchema.parse(await request(`/api/me/media/uploads/${task.assetId}`));
  }
  return task.media;
}
