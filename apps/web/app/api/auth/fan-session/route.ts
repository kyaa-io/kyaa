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
  return createFanSessionRoute({
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
