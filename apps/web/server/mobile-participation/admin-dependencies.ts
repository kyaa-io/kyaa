import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { authorizeAdminSession } from "@/server/admin/admin-session-gate";
import { createSupabaseAdminSessionRepository } from "@/server/admin/supabase-admin-session-repository";
import { loadServerEnv } from "@/server/config/env";
import { createParticipationAdminHandlers } from "./admin-routes";
export function createParticipationAdminRouteHandlers() { const env = loadServerEnv(); const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); const verifier = createPrivyNodeAccessVerifier({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, appEnvironment: env.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: env.PRIVY_APPLE_LOGIN_ENABLED }); const repository = createSupabaseAdminSessionRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }); return createParticipationAdminHandlers({ authorize: input => authorizeAdminSession({ ...input, verifier, repository }), async rpc(name, args) { const result = await db.rpc(name, args); if (result.error) throw new Error(result.error.message); return result.data; } }); }
export const participationAdminUnavailable = () => Response.json({ error: { code: "PARTICIPATION_ADMIN_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
