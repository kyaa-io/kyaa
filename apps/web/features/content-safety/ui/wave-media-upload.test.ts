import { afterEach, expect, it, vi } from "vitest";
import { cancelWaveUpload, uploadWaveMedia, validWaveFiles, type WaveUpload } from "./wave-media-upload";
const id = "11111111-1111-4111-8111-111111111111";
const image = () => new File(["image"], "photo.jpg", { type: "image/jpeg" });
afterEach(() => vi.unstubAllGlobals());
it("accepts 30 photos or one video and rejects mixed media, unknown files and excess photos", () => {
  const video = new File(["video"], "video.mp4", { type: "video/mp4" });
  expect(validWaveFiles(Array.from({ length: 30 }, image), [])).toBe(true);
  expect(validWaveFiles(Array.from({ length: 31 }, image), [])).toBe(false);
  expect(validWaveFiles([video], [])).toBe(true);
  expect(validWaveFiles([video, image()], [])).toBe(false);
  expect(validWaveFiles([video, video], [])).toBe(false);
  expect(validWaveFiles([new File(["x"], "x.html", { type: "text/html" })], [])).toBe(false);
});
it("retries completion with the same asset without re-uploading successful bytes", async () => {
  const ready = { assetId: id, state: "ready", kind: "image", purpose: "wave_album", contentType: "image/jpeg", byteSize: 5, assetVersion: 1, width: 100, height: 100, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-22T00:00:00Z" };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ assetId: id, uploadUrl: "https://storage.test/signed?token=private", uploadToken: "private", expiresAt: ready.expiresAt, replayed: false })).mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(ready));
  vi.stubGlobal("fetch", fetcher);
  const task: WaveUpload = { key: id, file: image() }, signal = new AbortController().signal, token = async () => "access";
  await expect(uploadWaveMedia(task, "wave_album", token, signal)).rejects.toThrow();
  await expect(uploadWaveMedia(task, "wave_album", token, signal)).resolves.toMatchObject({ state: "ready" });
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/me/media/uploads", "https://storage.test/signed?token=private", `/api/me/media/uploads/${id}/complete`, `/api/me/media/uploads/${id}/complete`]);
  expect(fetcher.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).requestId).toBe(id);
});
it("never uploads without an access token", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(uploadWaveMedia({ key: id, file: image() }, "wave_album", async () => null, new AbortController().signal)).rejects.toThrow("AUTHENTICATION_REQUIRED");
  expect(fetcher).not.toHaveBeenCalled();
});

it("cancels a reserved upload through the owner-authenticated endpoint", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal("fetch",fetcher);
  await cancelWaveUpload({key:id,file:image()},async()=>"token");expect(fetcher).not.toHaveBeenCalled();
  await cancelWaveUpload({key:id,assetId:id,file:image()},async()=>"token");
  expect(fetcher).toHaveBeenCalledWith(`/api/me/media/uploads/${id}`,expect.objectContaining({method:"DELETE",keepalive:true,credentials:"omit",headers:{Authorization:"Bearer token"}}));
});
