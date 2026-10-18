import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { createMobileBenefitsHandlers } from "./routes";

export function createMobileBenefitsRouteHandlers() {
  const env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const repository = createSupabaseFanAuthRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, db);
  return createMobileBenefitsHandlers({ authorize: authorization => authorizeFanRequest({ authorization: authorization ?? "", verifier, repository }), async rpc(name, args) { const result = await db.rpc(name, args); if (result.error) throw new Error(result.error.message); return result.data; } });
}
export const mobileBenefitsUnavailable = () => Response.json({ error: { code: "MOBILE_BENEFITS_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
