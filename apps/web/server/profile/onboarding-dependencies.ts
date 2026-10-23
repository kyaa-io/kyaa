import "server-only";
import { createClient } from "@/server/data/client";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { createOnboardingHandlers, type OnboardingDependencies } from "./onboarding-route";

export function createOnboardingRouteHandlers() {
  const env = loadServerEnv();
  const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET,
    appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const repository = createSupabaseFanAuthRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, database);
  return createOnboardingHandlers({
    authorize: (authorization) => authorizeFanRequest({ authorization, verifier, repository }),
    rpc: (name, parameters) => (database as unknown as Pick<OnboardingDependencies, "rpc">).rpc(name, parameters),
  });
}
