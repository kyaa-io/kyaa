import "server-only";
import { invokeMediaWorker } from "./aws-invoker";

import { storageObjectResponse } from "@/server/storage/transport";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { MEDIA_BUCKET } from "./domain";
import { createMobileMediaHandlers } from "./routes";
import { processMediaCleanup, processMediaValidationJob } from "./worker";
import { createMediaProcessorRuntime } from "./processor-runtime";
export { createMobileMediaMaintenance } from "./processor-runtime";

function createMobileMediaRuntime() {
  const runtime = createMediaProcessorRuntime();
  const { env, database } = runtime;
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const repository = createSupabaseFanAuthRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database);
  return { ...runtime, verifier, repository };
}

export function createMobileMediaRouteHandlers() {
  const { env, database, verifier, repository, rpc, storage, worker, cleanup } = createMobileMediaRuntime();
  return createMobileMediaHandlers({
    authorize: authorization => authorizeFanRequest({ authorization, verifier, repository }), rpc,
    async signUpload(path) {
      const result = await database.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path, { upsert: false }); if (result.error) throw new Error("MEDIA_UNAVAILABLE");
      let expires = Date.now() + 2 * 60 * 60 * 1000;
      try { const payload = JSON.parse(Buffer.from(result.data.token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number }; if (typeof payload.exp === "number") expires = payload.exp * 1000; } catch { /* conservative storage default */ }
      return { uploadUrl: result.data.signedUrl, token: result.data.token, tokenExpiresAt: new Date(expires).toISOString() };
    },
    async process(assetId) {
      if (process.env.HOSTING_PROVIDER === "aws" && process.env.CRON_OWNER === "aws") {
        try { await invokeMediaWorker(assetId); } catch { console.warn("MEDIA_WORKER_INVOCATION_PENDING"); }
        return;
      }
      await processMediaValidationJob(worker, assetId); await processMediaCleanup(cleanup);
    },
    async cleanup() { await processMediaCleanup(cleanup); },
    stream: (path, range, method) => storageObjectResponse(storage, MEDIA_BUCKET, path, { method, range, signal: AbortSignal.timeout(120_000) }),
  });
}

export const mediaUnavailable = () => Response.json({ error: { code: "MEDIA_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
