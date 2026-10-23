import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { S3Storage } from "@/server/storage/s3-storage";
import { storageObjectResponse, retryStorageDeletes } from "@/server/storage/transport";
import { MEDIA_BUCKET } from "./domain";
import { processMediaCleanup, processMediaValidationJob, type MediaCleanupDependencies, type MediaValidationJob, type MediaWorkerDependencies } from "./worker";

function objectUrl(base: string, path: string) { return `${base.replace(/\/$/, "")}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`; }

export function createMediaProcessorRuntime() {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const rpc = async (name: string, args: Record<string, unknown>) => { const result = await database.rpc(name, args); if (result.error) throw new Error(result.error.message); return result.data; };
  const storage = { database, url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
  const storageHeaders = () => {
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
    return { apikey: key, authorization: `Bearer ${key}` };
  };
  const worker: MediaWorkerDependencies = {
    async claim(assetId) { return await rpc("claim_mobile_media_validation", { p_asset_id: assetId ?? null }) as MediaValidationJob | null; },
    download: path => storageObjectResponse(storage, MEDIA_BUCKET, path, { signal: AbortSignal.timeout(60_000) }),
    async upload(path, body, contentType, job, timeoutMs) {
      try {
        if (database.storage instanceof S3Storage) {
          const uploaded = await (database.storage as unknown as S3Storage).from(MEDIA_BUCKET).upload(path, body, { contentType, cacheControl: "private, max-age=0", upsert: false, signal: AbortSignal.timeout(timeoutMs) });
          if (uploaded.error && Number(uploaded.error.statusCode) !== 409) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
          return;
        }
        const legacyUrl = env.SUPABASE_URL;
        if (!legacyUrl) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
        const url = objectUrl(legacyUrl, path).replace("/object/authenticated/", "/object/");
        const result = await fetch(url, { method: "POST", body: Buffer.from(body), headers: { ...storageHeaders(), "content-type": contentType, "cache-control": "private, max-age=0", "x-upsert": "false" }, signal: AbortSignal.timeout(timeoutMs) });
        if (!result.ok) { const existing = await fetch(objectUrl(legacyUrl, path), { method: "HEAD", headers: storageHeaders(), cache: "no-store", signal: AbortSignal.timeout(10_000) }); if (!existing.ok) throw new Error("MEDIA_STORAGE_UNAVAILABLE"); }
      } finally {
        // Await settlement and cleanup fencing even when cancellation wins during upload.
        await rpc("reconcile_mobile_media_upload_cleanup", { p_asset_id: job.assetId, p_asset_version: job.assetVersion, p_job_id: job.jobId });
      }
    },
    async finish(job, result) { await rpc("finish_mobile_media_validation_v2", { p_asset_id: job.assetId, p_asset_version: job.assetVersion, p_job_id: job.jobId, p_content_type: result.contentType, p_width: result.width, p_height: result.height, p_duration_seconds: result.durationSeconds, p_source_sha256: result.sourceSha256 }); },
    async reject(job, code) { await rpc("reject_mobile_media_validation", { p_asset_id: job.assetId, p_asset_version: job.assetVersion, p_job_id: job.jobId, p_error_code: code }); },
    async retry(job) { await rpc("retry_mobile_media_validation", { p_asset_id: job.assetId, p_asset_version: job.assetVersion, p_job_id: job.jobId }); },
  };
  const cleanup: MediaCleanupDependencies = {
    async claimCleanup(limit) { const value = await rpc("claim_mobile_media_cleanup", { p_limit: limit }) as { items: Array<{ assetId: string; storagePath: string; thumbnailPath: string; displayPath: string | null; generation: number }> }; return value.items; },
    async remove(paths) { const result = await database.storage.from(MEDIA_BUCKET).remove(paths); if (result.error) throw new Error("MEDIA_STORAGE_UNAVAILABLE"); },
    async finishCleanup(assetId, generation, succeeded) { await rpc("finish_mobile_media_cleanup", { p_asset_id: assetId, p_generation: generation, p_succeeded: succeeded }); },
  };
  return { env, database, rpc, storage, worker, cleanup };
}

export function createMobileMediaMaintenance() {
  const { worker, database, cleanup } = createMediaProcessorRuntime();
  return {
    async process(limit = 1, assetId?: string) {
      await retryStorageDeletes(database);
      let processed = 0;
      for (let index = 0; index < Math.min(Math.max(limit, 1), 1); index++) {
        if (!await processMediaValidationJob(worker, assetId)) break;
        processed++;
      }
      await processMediaCleanup(cleanup);
      return { processed };
    },
  };
}
