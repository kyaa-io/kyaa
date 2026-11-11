import "server-only";
import { refreshLocalSignupEvent } from "../signup-event/refresh";
import { createClient } from "@/server/data/client";
import { createPrivyNodeAccessVerifier } from "../auth/privy-node-verifier";
import { authorizeAdminSession } from "../admin/admin-session-gate";
import { createSupabaseAdminSessionRepository } from "../admin/supabase-admin-session-repository";
import { authorizeFanRequest } from "../fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "../fan-auth/supabase-fan-auth-repository";
import { loadServerEnv } from "../config/env";
import type { FanpageDependencies } from "./routes";
import { withWaveDisplayNames } from "../byus-day/wave-display-names";

export function createFanpageDependencies(): FanpageDependencies {
  const env = loadServerEnv();
  const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  const database = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET,
    appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED });
  const fans = createSupabaseFanAuthRepository(config, database);
  const admins = createSupabaseAdminSessionRepository(config);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await database.rpc(name, args);
    if (error) throw Object.assign(new Error(error.message), { code: error.code }); // keep the SQLSTATE for callers that record failures
    return data;
  };
  return {
    async rpc(name, args) {
      const result = await rpc(name, args);
      const owner = name === "attend_creator" ? args.p_user : name === "post_fan_post_comment" ? args.p_app_user_id : ((name === "groups_dispatch" && args.p_operation === "join") || (name === "groups_content_dispatch" && args.p_operation === "comment")) ? args.p_actor : null;
      if (typeof owner === "string") await refreshLocalSignupEvent(database, owner);
      return withWaveDisplayNames(rpc, name, args, result);
    },
    authorize: (authorization) => authorizeFanRequest({ authorization, verifier, repository: fans }),
    authorizeAdmin: (authorization, correlationId) => authorizeAdminSession({ authorization: authorization ?? "", correlationId, verifier, repository: admins }),
  };
}
