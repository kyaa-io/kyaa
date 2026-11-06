import "server-only";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeAdminSession } from "@/server/admin/admin-session-gate";
import { createSupabaseAdminSessionRepository } from "@/server/admin/supabase-admin-session-repository";
import { createJjinfanCampaignHandlers, createJjinfanCampaignRepository } from "./jjinfan-campaigns";

export function createJjinfanCampaignDependencies() {
  const env = loadServerEnv();
  const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  const verifier = createPrivyNodeAccessVerifier({
    appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET,
    appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED,
    appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED,
  });
  const repository = createSupabaseAdminSessionRepository(config);
  return createJjinfanCampaignHandlers({
    authorize: input => authorizeAdminSession({ ...input, verifier, repository }),
    repository: createJjinfanCampaignRepository(config),
  });
}
