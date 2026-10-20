import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { MEDIA_BUCKET } from "./domain";
import { createMobileMediaHandlers } from "./routes";
import { processMediaCleanup, processMediaValidationJob, type MediaCleanupDependencies, type MediaValidationJob, type MediaWorkerDependencies } from "./worker";

function objectUrl(base: string, path: string) { return `${base.replace(/\/$/, "")}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`; }

function createMobileMediaRuntime() {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const repository = createSupabaseFanAuthRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database);
  const rpc = async (name: string, args: Record<string, unknown>) => { const result = await database.rpc(name, args); if (result.error) throw new Error(result.error.message); return result.data; };
  const storageHeaders = (range?: string | null) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(range ? { range } : {}) });
  const worker: MediaWorkerDependencies = {
    async claim(assetId) { return await rpc("claim_mobile_media_validation", { p_asset_id: assetId ?? null }) as MediaValidationJob | null; },
    download: path => fetch(objectUrl(env.SUPABASE_URL, path), { headers: storageHeaders(), cache: "no-store", signal: AbortSignal.timeout(60_000) }),
    async upload(path, body, contentType, job, timeoutMs) {
      try {
        const url = objectUrl(env.SUPABASE_URL, path).replace("/object/authenticated/", "/object/");
        const result = await fetch(url, { method: "POST", body: Buffer.from(body), headers: { ...storageHeaders(), "content-type": contentType, "cache-control": "private, max-age=0", "x-upsert": "false" }, signal: AbortSignal.timeout(timeoutMs) });
        if (!result.ok) { const existing = await fetch(objectUrl(env.SUPABASE_URL, path), { method: "HEAD", headers: storageHeaders(), cache: "no-store", signal: AbortSignal.timeout(10_000) }); if (!existing.ok) throw new Error("MEDIA_STORAGE_UNAVAILABLE"); }
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
  return { env, database, verifier, repository, rpc, storageHeaders, worker, cleanup };
}

export function createMobileMediaMaintenance() {
  const { worker } = createMobileMediaRuntime();
  return {
    async process(limit = 1) {
      let processed = 0;
      for (let index = 0; index < Math.min(Math.max(limit, 1), 1); index++) {
        if (!await processMediaValidationJob(worker)) break;
        processed++;
      }
      return { processed };
    },
  };
}

export function createMobileMediaRouteHandlers() {
  const { env, database, verifier, repository, rpc, storageHeaders, worker, cleanup } = createMobileMediaRuntime();
  return createMobileMediaHandlers({
    authorize: authorization => authorizeFanRequest({ authorization, verifier, repository }), rpc,
    async signUpload(path) {
      const result = await database.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path, { upsert: false }); if (result.error) throw new Error("MEDIA_UNAVAILABLE");
      let expires = Date.now() + 2 * 60 * 60 * 1000;
      try { const payload = JSON.parse(Buffer.from(result.data.token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number }; if (typeof payload.exp === "number") expires = payload.exp * 1000; } catch { /* conservative storage default */ }
      return { uploadUrl: result.data.signedUrl, token: result.data.token, tokenExpiresAt: new Date(expires).toISOString() };
    },
    async process(assetId) { await processMediaValidationJob(worker, assetId); await processMediaCleanup(cleanup); },
    async cleanup() { await processMediaCleanup(cleanup); },
    stream: (path, range, method) => fetch(objectUrl(env.SUPABASE_URL, path), { method, headers: storageHeaders(range), cache: "no-store", signal: AbortSignal.timeout(120_000) }),
  });
}

export const mediaUnavailable = () => Response.json({ error: { code: "MEDIA_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
