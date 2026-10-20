import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { processMediaCleanup, processMediaValidationJob, runMediaCommand, type MediaValidationJob } from "./worker";

const asset = "22222222-2222-4222-8222-222222222222", jobId = "33333333-3333-4333-8333-333333333333";
function run(binary: string, args: string[]) { return new Promise<void>((resolve, reject) => { const child = spawn(binary, args, { stdio: "ignore" }); child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new Error(`processor exit ${code}`))); }); }

describe("mobile media worker", () => {
  it("checks actual image bytes and creates a bounded thumbnail before the CAS finish", async () => {
    const source = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();
    const job: MediaValidationJob = { assetId: asset, jobId, assetVersion: 1, state: "processing", kind: "image", purpose: "dm", contentType: "image/jpeg", byteSize: source.byteLength, storagePath: "owner/asset/original.jpg", thumbnailPath: "owner/asset/thumbnail.webp", width: null, height: null, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
    const upload = vi.fn(), finish = vi.fn(), reject = vi.fn(), retry = vi.fn();
    expect(await processMediaValidationJob({ claim: vi.fn(async () => job), download: vi.fn(async () => new Response(source, { headers: { "content-length": String(source.byteLength), "content-type": "image/jpeg" } })), upload, finish, reject, retry }, asset)).toBe(true);
    expect(upload).toHaveBeenCalledWith(job.thumbnailPath, expect.any(Uint8Array), "image/webp", job, expect.any(Number));
    expect(finish).toHaveBeenCalledWith(job, { width: 20, height: 10, durationSeconds: null, contentType: "image/jpeg", sourceSha256: createHash("sha256").update(source).digest("hex") });
    expect(reject).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
  });
  it("keeps the raw Wave photo and uploads normalized display plus thumbnail before finish", async () => {
    const source = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();
    const job: MediaValidationJob = { assetId: asset, jobId, assetVersion: 1, state: "processing", kind: "image", purpose: "wave_album", contentType: "image/jpeg", byteSize: source.byteLength, storagePath: "owner/asset/original.jpg", thumbnailPath: "owner/asset/thumbnail.webp", width: null, height: null, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
    const upload = vi.fn(), finish = vi.fn(), reject = vi.fn(), retry = vi.fn();
    await processMediaValidationJob({ claim: vi.fn(async () => job), download: vi.fn(async () => new Response(source)), upload, finish, reject, retry }, asset);
    expect(upload.mock.calls.map(call => call[0])).toEqual(["owner/asset/display.webp", job.thumbnailPath]);
    expect((await sharp(upload.mock.calls[0][1]).metadata()).format).toBe("webp");
    expect(finish.mock.invocationCallOrder[0]).toBeGreaterThan(upload.mock.invocationCallOrder[1]);
    expect(finish).toHaveBeenCalledWith(job, expect.objectContaining({ contentType: "image/jpeg", sourceSha256: createHash("sha256").update(source).digest("hex") }));
    expect(reject).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
    const remove = vi.fn();
    await processMediaCleanup({ claimCleanup: vi.fn(async () => [{ assetId: asset, storagePath: job.storagePath, thumbnailPath: job.thumbnailPath, displayPath: "owner/asset/display.webp", generation: 1 }]), remove, finishCleanup: vi.fn() });
    expect(remove).toHaveBeenCalledWith([job.storagePath, job.thumbnailPath, "owner/asset/display.webp"]);
  });
  it("rejects a declared MIME that does not match actual bytes", async () => {
    const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
    const job: MediaValidationJob = { assetId: asset, jobId, assetVersion: 1, state: "processing", kind: "image", purpose: "dm", contentType: "image/jpeg", byteSize: source.byteLength, storagePath: "original", thumbnailPath: "thumbnail", width: null, height: null, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
    const reject = vi.fn(); await processMediaValidationJob({ claim: vi.fn(async () => job), download: vi.fn(async () => new Response(source)), upload: vi.fn(), finish: vi.fn(), reject, retry: vi.fn() }, asset);
    expect(reject).toHaveBeenCalledWith(job, "MEDIA_TYPE_MISMATCH");
  });
  it("rejects corrupt image bytes as terminal invalid input", async () => {
    const source = new TextEncoder().encode("not an image");
    const job: MediaValidationJob = { assetId: asset, jobId, assetVersion: 1, state: "processing", kind: "image", purpose: "dm", contentType: "image/jpeg", byteSize: source.byteLength, storagePath: "original", thumbnailPath: "thumbnail", width: null, height: null, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
    const reject = vi.fn(), retry = vi.fn(); await processMediaValidationJob({ claim: vi.fn(async () => job), download: vi.fn(async () => new Response(source)), upload: vi.fn(), finish: vi.fn(), reject, retry }, asset);
    expect(reject).toHaveBeenCalledWith(job, "MEDIA_INVALID_FORMAT"); expect(retry).not.toHaveBeenCalled();
  });
  it("rejects playlist input because video inspection is pinned to the mov demuxer", async () => {
    const source = new TextEncoder().encode("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://example.test/video.mp4\n");
    const job: MediaValidationJob = { assetId: asset, jobId, assetVersion: 1, state: "processing", kind: "video", purpose: "fan_clip", contentType: "video/mp4", byteSize: source.byteLength, storagePath: "original.mp4", thumbnailPath: "thumbnail.webp", width: null, height: null, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
    const reject = vi.fn(), retry = vi.fn(); await processMediaValidationJob({ claim: vi.fn(async () => job), download: vi.fn(async () => new Response(source)), upload: vi.fn(), finish: vi.fn(), reject, retry }, asset);
    expect(reject).toHaveBeenCalledWith(job, "MEDIA_INVALID_FORMAT"); expect(retry).not.toHaveBeenCalled();
  });
  it("kills processors that exceed the time or combined output limit", async () => {
    await expect(runMediaCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 30, 1024)).rejects.toThrow("MEDIA_PROCESSOR_TIMEOUT");
    await expect(runMediaCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(2048))"], 1_000, 1024)).rejects.toThrow("MEDIA_PROCESSOR_OUTPUT_LIMIT");
  });
  it("measures the actual video duration and creates its thumbnail", async () => {
    if (!ffmpegPath) throw new Error("bundled ffmpeg missing");
    const path = join(tmpdir(), `byus-worker-${crypto.randomUUID()}.mp4`);
    await run(ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path]);
    const source = await readFile(path); await import("node:fs/promises").then(module => module.unlink(path));
    const job: MediaValidationJob = { assetId: asset, jobId, assetVersion: 1, state: "processing", kind: "video", purpose: "fan_clip", contentType: "video/mp4", byteSize: source.byteLength, storagePath: "original.mp4", thumbnailPath: "thumbnail.webp", width: null, height: null, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
    const upload = vi.fn(), finish = vi.fn();
    await processMediaValidationJob({ claim: vi.fn(async () => job), download: vi.fn(async () => new Response(source)), upload, finish, reject: vi.fn(), retry: vi.fn() }, asset);
    expect(finish).toHaveBeenCalledWith(job, expect.objectContaining({ width: 160, height: 90, contentType: "video/mp4", durationSeconds: expect.closeTo(1, 1) }));
    expect(upload).toHaveBeenCalledWith(job.thumbnailPath, expect.any(Uint8Array), "image/webp", job, expect.any(Number));
  }, 20_000);
  it("removes original and derivative as one durable cleanup item", async () => {
    const finishCleanup = vi.fn();
    expect(await processMediaCleanup({ claimCleanup: vi.fn(async () => [{ assetId: asset, storagePath: "original", thumbnailPath: "thumbnail", displayPath: null, generation: 2 }]), remove: vi.fn(), finishCleanup }, 1)).toBe(1);
    expect(finishCleanup).toHaveBeenCalledWith(asset, 2, true);
  });
});
