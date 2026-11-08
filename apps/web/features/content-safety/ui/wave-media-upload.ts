import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { z } from "zod";
import { ownedMediaSchema, type OwnedMedia } from "@/server/mobile-media/domain";

export type WaveUpload = { key: string; file: File; assetId?: string; uploaded?: boolean; media?: OwnedMedia; failed?: boolean; /** 0..1 of the file's bytes sent (261107-2 D5). */ progress?: number };
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
export async function uploadWaveMedia(task: WaveUpload, purpose: "fan_post" | "wave_album" | "wave_post" | "group_post" | "group_image" | "dm", getToken: () => Promise<string | null>, signal: AbortSignal, onProgress?: (sent: number) => void): Promise<OwnedMedia> {
  async function request(path: string, method = "GET", body?: unknown) {
    const token = await getToken(); throwIfAborted(signal); if (!token) throw new Error("AUTHENTICATION_REQUIRED");
    const response = await fetch(path, { method, signal, cache: "no-store", credentials: "omit", headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error("MEDIA_UNAVAILABLE");
    return response.json();
  }
  if (task.media?.state === "ready") return task.media;
  if (!task.uploaded) {
    const reserved = reservationSchema.parse(await request("/api/me/media/uploads", "POST", { kind: task.file.type.startsWith("video/") ? "video" : "image", purpose, contentType: task.file.type, byteSize: task.file.size, requestId: task.key }));
    task.assetId = reserved.assetId;
    const headers: Record<string, string> = { "content-type": task.file.type, "x-upsert": "false", ...(reserved.uploadToken.startsWith("s3.") ? { "if-none-match": "*" } : {}) };
    const status = onProgress && typeof XMLHttpRequest !== "undefined"
      ? await putWithProgress(reserved.uploadUrl, task.file, headers, signal, onProgress)
      : (await fetch(reserved.uploadUrl, { method: "PUT", signal, credentials: "omit", headers, body: task.file })).status;
    if ((status < 200 || status > 299) && status !== 409 && status !== 412) throw new Error("MEDIA_UPLOAD_FAILED");
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

/** fetch cannot report upload progress, so a caller that shows a bar gets the same PUT through XMLHttpRequest. Answers the status. */
function putWithProgress(url: string, file: File, headers: Record<string, string>, signal: AbortSignal, onProgress: (sent: number) => void) {
  return new Promise<number>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", url);
    xhr.withCredentials = false;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = event => { if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total); };
    xhr.onload = () => { signal.removeEventListener("abort", abort); onProgress(1); resolve(xhr.status); };
    xhr.onerror = () => { signal.removeEventListener("abort", abort); reject(new Error("MEDIA_UPLOAD_FAILED")); };
    xhr.onabort = () => { signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    xhr.send(file);
  });
}
