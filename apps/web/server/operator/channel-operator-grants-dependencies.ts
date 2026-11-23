import "server-only";
import { createPrivyNodeAccessVerifier } from "../auth/privy-node-verifier";
import { loadServerEnv } from "../config/env";
import { authorizeAdminSession } from "../admin/admin-session-gate";
import { createSupabaseAdminSessionRepository } from "../admin/supabase-admin-session-repository";
import { createChannelOperatorGrantHandlers, createChannelOperatorGrantRepository } from "./channel-operator-grants";

export function createChannelOperatorGrantDependencies() {
  const env = loadServerEnv();
  const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  const verifier = createPrivyNodeAccessVerifier({
    appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET,
    appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED,
    appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED,
  });
  const repository = createSupabaseAdminSessionRepository(config);
  const origin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  return createChannelOperatorGrantHandlers({
    // Invitation links are built only for origins the invitation table accepts.
    ...(/^(https:\/\/(dev\.)?kyaa\.io|http:\/\/(localhost|127\.0\.0\.1):\d{2,5})$/.test(origin) ? { origin } : {}),
    authorize: (input) => authorizeAdminSession({ ...input, verifier, repository }),
    repository: createChannelOperatorGrantRepository(config),
  });
}
