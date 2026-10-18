import { PrivyClient } from "@privy-io/node";
import { createClient } from "@supabase/supabase-js";

import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { createFanProviderReader } from "@/server/g5/fan-account-info";
import {
  createMobileAccountInfoHandler,
  createMobileAccountInfoRepository,
} from "@/server/mobile-profile/account-info";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const environment = loadServerEnv();
  const privy = new PrivyClient({
    appId: environment.PRIVY_APP_ID,
    appSecret: environment.PRIVY_APP_SECRET,
  });
  const verifier = createPrivyNodeAccessVerifier({
    appId: environment.PRIVY_APP_ID,
    appSecret: environment.PRIVY_APP_SECRET,
    appEnvironment: environment.PRIVY_APP_ENVIRONMENT,
    testAccountLoginEnabled: environment.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED,
    appleLoginEnabled: environment.PRIVY_APPLE_LOGIN_ENABLED,
  }, privy);
  const config = {
    url: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  };
  const database = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const fans = createSupabaseFanAuthRepository(config, database);
  return createMobileAccountInfoHandler({
    authorize: (authorization) =>
      authorizeFanRequest({ authorization, verifier, repository: fans }),
    repository: createMobileAccountInfoRepository(database),
    readProviders: createFanProviderReader({
      appId: environment.PRIVY_APP_ID,
      client: privy,
    }),
  })(request);
}
