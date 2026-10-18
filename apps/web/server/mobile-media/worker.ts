import "server-only";
import { createHash } from "node:crypto";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import sharp from "sharp";
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, type OwnedMedia } from "./domain";

export type MediaValidationJob = OwnedMedia & { jobId: string; storagePath: string; thumbnailPath: string };
export interface MediaWorkerDependencies {
  claim(assetId?: string): Promise<MediaValidationJob | null>;
  download(path: string): Promise<Response>;
  upload(path: string, body: Uint8Array, contentType: string): Promise<void>;
  finish(job: MediaValidationJob, result: { width: number; height: number; durationSeconds: number | null; contentType: string; sourceSha256: string }): Promise<void>;
  reject(job: MediaValidationJob, code: string): Promise<void>;
  retry(job: MediaValidationJob): Promise<void>;
}
export interface MediaCleanupDependencies {
  claimCleanup(limit: number): Promise<Array<{ assetId: string; storagePath: string; thumbnailPath: string; generation: number }>>;
  remove(paths: string[]): Promise<void>;
  finishCleanup(assetId: string, generation: number, succeeded: boolean): Promise<void>;
}

const PROCESS_TIMEOUT_MS = 30_000;
const PROCESS_OUTPUT_MAX_BYTES = 64 * 1024;
const JOB_TIMEOUT_MS = 115_000;

function within<T>(promise: Promise<T>, timeoutMs: number, code = "MEDIA_PROCESSOR_TIMEOUT") {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), Math.max(1, timeoutMs));
    timer.unref();
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function runMediaCommand(binary: string, args: string[], timeoutMs = PROCESS_TIMEOUT_MS, maxOutputBytes = PROCESS_OUTPUT_MAX_BYTES) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let outputBytes = 0, settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!child.killed) child.kill("SIGKILL");
      reject(error);
    };
    const collect = (target: Buffer[]) => (value: Buffer) => {
      outputBytes += value.byteLength;
      if (outputBytes > maxOutputBytes) fail(new Error("MEDIA_PROCESSOR_OUTPUT_LIMIT"));
      else target.push(value);
    };
    child.stdout.on("data", collect(stdout)); child.stderr.on("data", collect(stderr));
    const timer = setTimeout(() => fail(new Error("MEDIA_PROCESSOR_TIMEOUT")), timeoutMs);
    timer.unref();
    child.on("error", fail);
    child.on("close", code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      code === 0 ? resolve(Buffer.concat(stdout).toString("utf8")) : reject(new Error(Buffer.concat(stderr).toString("utf8").slice(0, 500)));
    });
  });
}

async function storeResponse(response: Response, path: string, maxBytes: number) {
  if (!response.ok || !response.body) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("MEDIA_TOO_LARGE");
  let size = 0;
  const hash = createHash("sha256");
  const source = Readable.fromWeb(response.body as never);
  source.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) source.destroy(new Error("MEDIA_TOO_LARGE")); else hash.update(chunk); });
  await pipeline(source, await import("node:fs").then(module => module.createWriteStream(path, { flags: "wx" })));
  return { size, sourceSha256: hash.digest("hex"), contentType: response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() ?? "" };
}

function configuredBinary(name: "ffprobe" | "ffmpeg") {
  const configured = process.env[name === "ffprobe" ? "MEDIA_FFPROBE_PATH" : "MEDIA_FFMPEG_PATH"];
  const bundled = name === "ffprobe" ? ffprobeStatic.path : ffmpegPath;
  if (!configured && !bundled) throw new Error("MEDIA_PROCESSOR_UNAVAILABLE");
  return configured || bundled || name;
}

export async function processMediaValidationJob(deps: MediaWorkerDependencies, assetId?: string): Promise<boolean> {
  const job = await deps.claim(assetId); if (!job) return false;
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  const remaining = (cap = JOB_TIMEOUT_MS) => Math.max(1, Math.min(cap, deadline - Date.now()));
  const directory = await mkdtemp(join(tmpdir(), "byus-media-")); const source = join(directory, "source"), thumbnail = join(directory, "thumbnail.webp");
  try {
    const max = job.kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
    const stored = await storeResponse(await within(deps.download(job.storagePath), remaining(60_000)), source, max);
    if (stored.size !== job.byteSize) throw new Error("MEDIA_SIZE_MISMATCH");
    let width = 0, height = 0, durationSeconds: number | null = null, contentType = stored.contentType;
    if (job.kind === "image") {
      try {
        const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
        const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
        contentType = metadata.format ? formats[metadata.format] ?? "" : "";
        width = metadata.width ?? 0; height = metadata.height ?? 0;
        if (!contentType || !width || !height) throw new Error("MEDIA_INVALID_FORMAT");
        await sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 720, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbnail);
      } catch (error) {
        if (error instanceof Error && error.message === "MEDIA_INVALID_FORMAT") throw error;
        throw new Error("MEDIA_INVALID_FORMAT");
      }
    } else {
      let probe: { streams?: Array<{ width?: number; height?: number; duration?: string }>; format?: { duration?: string; format_name?: string } };
      try {
        probe = JSON.parse(await runMediaCommand(configuredBinary("ffprobe"), ["-v", "error", "-protocol_whitelist", "file,pipe", "-f", "mov", "-enable_drefs", "0", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration:format=duration,format_name", "-of", "json", source], remaining(PROCESS_TIMEOUT_MS)));
      } catch (error) {
        if (error instanceof Error && /^MEDIA_PROCESSOR_(?:TIMEOUT|OUTPUT_LIMIT)$/.test(error.message)) throw error;
        throw new Error("MEDIA_INVALID_FORMAT");
      }
      const stream = probe.streams?.[0]; width = stream?.width ?? 0; height = stream?.height ?? 0; durationSeconds = Number(stream?.duration ?? probe.format?.duration);
      const format = probe.format?.format_name ?? ""; contentType = format.includes("mov") && job.contentType === "video/quicktime" ? "video/quicktime" : format.includes("mp4") || format.includes("mov") ? "video/mp4" : "";
      if (!contentType || !width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > VIDEO_MAX_SECONDS) throw new Error("MEDIA_INVALID_FORMAT");
      try {
        await runMediaCommand(configuredBinary("ffmpeg"), ["-v", "error", "-protocol_whitelist", "file,pipe", "-f", "mov", "-enable_drefs", "0", "-ss", "0", "-i", source, "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-y", thumbnail], remaining(PROCESS_TIMEOUT_MS));
      } catch (error) {
        if (error instanceof Error && /^MEDIA_PROCESSOR_(?:TIMEOUT|OUTPUT_LIMIT)$/.test(error.message)) throw error;
        throw new Error("MEDIA_INVALID_FORMAT");
      }
    }
    if (contentType !== job.contentType) throw new Error("MEDIA_TYPE_MISMATCH");
    await within(deps.upload(job.thumbnailPath, new Uint8Array(await readFile(thumbnail)), "image/webp"), remaining());
    await within(deps.finish(job, { width, height, durationSeconds, contentType, sourceSha256: stored.sourceSha256 }), remaining());
  } catch (error) {
    const code = error instanceof Error ? error.message : "MEDIA_VALIDATION_FAILED";
    if (code === "MEDIA_CONFLICT") { /* cancellation or deletion won the CAS */ }
    else if (/^MEDIA_(TOO_LARGE|SIZE_MISMATCH|INVALID_FORMAT|TYPE_MISMATCH|PROCESSOR_TIMEOUT|PROCESSOR_OUTPUT_LIMIT)$/.test(code)) await deps.reject(job, code);
    else await deps.retry(job);
  } finally { await rm(directory, { recursive: true, force: true }); }
  return true;
}

export async function processMediaCleanup(deps: MediaCleanupDependencies, limit = 10) {
  const items = await deps.claimCleanup(Math.min(Math.max(limit, 1), 25)); let removed = 0;
  for (const item of items) {
    let succeeded = false;
    try { await deps.remove([item.storagePath, item.thumbnailPath]); succeeded = true; removed++; } catch { /* durable cleanup retries */ }
    await deps.finishCleanup(item.assetId, item.generation, succeeded);
  }
  return removed;
}
