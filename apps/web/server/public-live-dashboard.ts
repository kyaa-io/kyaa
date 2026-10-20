import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parsePublicDashboard } from "@/features/public-live-dashboard/domain/public-live-dashboard";
import { loadServerEnv } from "./config/env";
import { getDashboardOnchainResult, type DashboardOnchainResult } from "./onchain/dashboard-snapshot";

type Dependencies = { readDatabase(): Promise<unknown>; readOnchain(): Promise<DashboardOnchainResult> };

async function boundedRead<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Return partial metrics before the screen's eight-second request deadline.
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("DASHBOARD_SOURCE_TIMEOUT")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

export function createPublicLiveDashboardHandler(deps: Dependencies) {
  return async () => {
    const [database, chain] = await Promise.allSettled([boundedRead(deps.readDatabase()), boundedRead(deps.readOnchain())]);
    const onchain = chain.status === "fulfilled" && chain.value.state === "available"
      ? { state: "available", ...chain.value.data } : { state: "unavailable" };
    return Response.json(parsePublicDashboard({
      database: database.status === "fulfilled" && database.value && typeof database.value === "object"
        ? { ...database.value, state: "available" } : { state: "unavailable" },
      onchain,
    }), { headers: { "cache-control": "no-store" } });
  };
}

export function getPublicLiveDashboard() {
  return createPublicLiveDashboardHandler({
    async readDatabase() {
      const env = loadServerEnv();
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await db.rpc("read_public_live_dashboard").abortSignal(AbortSignal.timeout(5000));
      if (error) throw new Error("DASHBOARD_UNAVAILABLE");
      return data;
    },
    readOnchain: getDashboardOnchainResult,
  })();
}
