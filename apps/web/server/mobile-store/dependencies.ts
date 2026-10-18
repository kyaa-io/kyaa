import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { verifyAppleTransaction } from "./apple-verifier";
import { GooglePlayDeveloperClient, verifyGooglePurchase } from "./google-verifier";
import { MobileStoreRepository, type MobileStoreDatabase } from "./repository";
import { createMobileStoreHandlers } from "./routes";

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function optionalPositiveInteger(name: string): number | undefined {
  const value = process.env[name]; if (!value) return undefined;
  const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${name}`); return parsed;
}

export function createMobileStoreRouteHandlers() {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT,
    testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const fanRepository = createSupabaseFanAuthRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database);
  const repository = new MobileStoreRepository(database as unknown as MobileStoreDatabase);
  return createMobileStoreHandlers({
    authorize: (authorization) => authorizeFanRequest({ authorization, verifier, repository: fanRepository }), repository,
    verifyApple: (signed) => verifyAppleTransaction(signed, { trustedRootsPem: required("APPLE_STORE_ROOT_CERTIFICATES_PEM"), bundleId: required("APPLE_STORE_BUNDLE_ID"), appAppleId: optionalPositiveInteger("APPLE_STORE_APP_APPLE_ID") }),
    verifyGoogle: (token, productId) => verifyGooglePurchase(token, productId, new GooglePlayDeveloperClient({
      packageName: required("GOOGLE_PLAY_PACKAGE_NAME"), clientEmail: required("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL"),
      privateKey: required("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY"),
    })),
  });
}

export function mobileStoreUnavailableResponse(): Response {
  return Response.json({ error: { code: "STORE_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store", vary: "Authorization" } });
}
