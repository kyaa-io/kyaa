import "server-only";
import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../config/env";
import { createPrivyNodeAccessVerifier } from "../auth/privy-node-verifier";
import { authorizeFanRequest } from "../fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "../fan-auth/supabase-fan-auth-repository";
import { authorizeAdminSession } from "../admin/admin-session-gate";
import { createSupabaseAdminSessionRepository } from "../admin/supabase-admin-session-repository";
import { getPublicOnchainResult } from "../onchain/public-snapshot";
import { LiveParticipationRepository } from "./repository";
export function createLiveParticipationDependencies() {
  const env = loadServerEnv();
  const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  const db = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const fan = createSupabaseFanAuthRepository(config, db); const admin = createSupabaseAdminSessionRepository(config, db);
  return { repository: new LiveParticipationRepository(db), authorize: (authorization: string | null) => authorizeFanRequest({ authorization, verifier, repository: fan }), authorizeAdmin: (authorization: string, correlationId: string) => authorizeAdminSession({ authorization, correlationId, verifier, repository: admin }), readOnchain: getPublicOnchainResult };
}
