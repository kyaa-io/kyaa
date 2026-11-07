import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/server/data/client";
import { createPrivyNodeAccessVerifier } from "@/server/auth/privy-node-verifier";
import { loadServerEnv } from "@/server/config/env";
import { authorizeFanRequest } from "@/server/fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "@/server/fan-auth/supabase-fan-auth-repository";
import { createSupabaseMySummaryRepository } from "@/server/my/my-summary-repository";
import { mySummarySchema } from "@/features/my/domain/my-summary";
import { pickSelectedBias, selectedBiasOptions, type SelectedBiasOption } from "@/features/selected-bias/domain/selected-bias-pick";
import { toContentLocale, type AppLocale } from "@/i18n/locales";

const DEADLINE_MS = 1200;

/** The favorite the header would pick with no stored choice, read for the signed-in browser's own request (its Privy access cookie)
 * so the first HTML can draw it. Read-only: the same verifier and summary read as `GET /api/me/summary`, without draining notifications.
 * Anything unknown (no cookie, expired token, slow read) is null and the client reads it as before. */
export async function loadServerSelectedBias(locale: AppLocale): Promise<SelectedBiasOption | null> {
  const token = (await cookies()).get("privy-token")?.value;
  if (!token) return null;
  const read = (async () => {
    const environment = loadServerEnv();
    const database = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const fan = await authorizeFanRequest({
      authorization: `Bearer ${token}`,
      verifier: createPrivyNodeAccessVerifier({ appId: environment.PRIVY_APP_ID, appSecret: environment.PRIVY_APP_SECRET, appEnvironment: environment.PRIVY_APP_ENVIRONMENT, testAccountLoginEnabled: environment.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: environment.PRIVY_APPLE_LOGIN_ENABLED }),
      repository: createSupabaseFanAuthRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }, database),
    });
    const summary = await createSupabaseMySummaryRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }, database).get({ appUserId: fan.appUserId, locale: toContentLocale(locale), asOf: new Date(), includeStages: true, includeHearts: true });
    return pickSelectedBias(selectedBiasOptions(mySummarySchema.parse(JSON.parse(JSON.stringify(summary)))), null);
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), DEADLINE_MS); })]);
  } catch { return null; } finally { clearTimeout(timer); read.catch(() => {}); }
}
