import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { GooglePlayDeveloperClient, verifyGoogleWebhookAuthorization } from "./google-verifier";
import { MobileStoreRepository, verifiedStoreParameters, type MobileStoreDatabase } from "./repository";
import { createMobileStoreWebhookHandlers } from "./webhooks";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function optionalPositiveInteger(name: string): number | undefined { const value = process.env[name]; if (!value) return undefined; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${name}`); return parsed; }
export function createMobileStoreWebhookRouteHandlers(capture?: {rpc(name:string,args:Record<string,unknown>):Promise<unknown>}) {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return createMobileStoreWebhookHandlers({
    repository: capture ? { applyVerified: async input => { await capture.rpc("mobile_store_apply_entitlement_verified", verifiedStoreParameters(input)); } } : new MobileStoreRepository(database as unknown as MobileStoreDatabase),
    getAppleConfig: () => ({ roots: required("APPLE_STORE_ROOT_CERTIFICATES_PEM"), bundleId: required("APPLE_STORE_BUNDLE_ID"), appAppleId: optionalPositiveInteger("APPLE_STORE_APP_APPLE_ID") }),
    getGoogleConfig: () => {
      const packageName = required("GOOGLE_PLAY_PACKAGE_NAME");
      return { audience: required("GOOGLE_PLAY_WEBHOOK_AUDIENCE"), serviceAccountEmail: required("GOOGLE_PLAY_WEBHOOK_SERVICE_ACCOUNT_EMAIL"), packageName,
        client: new GooglePlayDeveloperClient({ packageName, clientEmail: required("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL"), privateKey: required("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY") }) };
    },
    verifyGoogleAuthorization: verifyGoogleWebhookAuthorization,
  });
}
export function mobileStoreWebhookUnavailableResponse(): Response { return Response.json({ error: { code: "WEBHOOK_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } }); }
