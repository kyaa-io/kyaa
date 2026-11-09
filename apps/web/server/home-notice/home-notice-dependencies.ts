import "server-only";
import { createClient } from "@/server/data/client";
import { authorizeAdminSession } from "../admin/admin-session-gate";
import { createSupabaseAdminSessionRepository } from "../admin/supabase-admin-session-repository";
import { createPrivyNodeAccessVerifier } from "../auth/privy-node-verifier";
import { invalidatePublicContentCache } from "../cache/public-content-revalidation";
import { loadServerEnv } from "../config/env";
import { createPublicImageRepository } from "../media/public-image-repository";
import { createHomeNoticeRepository } from "./home-notice-repository";
import type { HomeNoticeAdminDependencies } from "./home-notice-routes";

export function createPublicHomeNoticeRepository() {
  const env = loadServerEnv();
  return createHomeNoticeRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
}

export function createHomeNoticeAdminDependencies(): HomeNoticeAdminDependencies {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verifier = createPrivyNodeAccessVerifier({
    appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT,
    testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED,
  });
  const sessions = createSupabaseAdminSessionRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database);
  const images = createPublicImageRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database);
  return {
    authorize: (input) => authorizeAdminSession({ ...input, verifier, repository: sessions }),
    repository: createHomeNoticeRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database),
    registerImage: (actor, correlationId, bytes) => images.normalizeAndRegister(actor, correlationId, bytes),
    invalidatePublicContent: invalidatePublicContentCache,
  };
}
