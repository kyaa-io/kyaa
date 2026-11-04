import "server-only";
import { createPrivyNodeAccessVerifier } from "../auth/privy-node-verifier";
import { loadServerEnv } from "../config/env";
import { authorizeChannelSession } from "./channel-operator-gate";
import { createSupabaseChannelOperatorRepository } from "./supabase-channel-operator-repository";

export function createOperatorAuthorizer() {
  const env = loadServerEnv();
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const repository = createSupabaseChannelOperatorRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  return {
    authorize: (authorization: string | null, correlationId: string, celebrityId: string | null) =>
      authorizeChannelSession({ authorization: authorization ?? "", correlationId, celebrityId, verifier, repository }),
    repository,
  };
}
