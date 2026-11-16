import { createSupabaseChannelOperatorRepository } from "@/server/operator/supabase-channel-operator-repository";
import { createClient } from "@/server/data/client";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { fanSessionKey } from "@/server/auth/fan-session-cookie";
import { createFanSessionRoute } from "@/server/auth/fan-session-route";
import { loadServerEnv } from "@/server/config/env";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";

export const dynamic = "force-dynamic";

function route() {
  const env = loadServerEnv();
  const verifier = createPrivyNodeAccessVerifier({
    appId: env.PRIVY_APP_ID,
    appSecret: env.PRIVY_APP_SECRET,
    appEnvironment: env.PRIVY_APP_ENVIRONMENT,
    testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED,
    appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED,
  });
  const config = { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  const operators = createSupabaseChannelOperatorRepository(config);
  return createFanSessionRoute({
    verifyCookie: () => verifier.verify("kyaa-session"),
    isPrivileged: async (id, email) => Boolean(await operators.findActiveAdminByEmail(email)) || (await operators.listActiveChannelIds(id)).length > 0,
    revokeSessions: async (id, timestamp) => {
      const database = createClient(config.url, config.serviceRoleKey);
      const { error } = await database.rpc("revoke_fan_sessions", { target_user_id: id, revoked_at: timestamp });
      if (error) throw new Error("Session revocation failed");
    },
    enabled: process.env.FAN_SESSION_ISSUE !== "off",
    appOrigin: new URL(env.NEXT_PUBLIC_APP_URL).origin,
    key: fanSessionKey(env.AUTH_COOKIE_SECRET),
    resolve: (token) => verifier.resolveFanSession(token),
    repository: createSupabaseFanAuthRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
  });
}

export async function POST(request: Request): Promise<Response> {
  return route().POST(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return route().DELETE(request);
}
