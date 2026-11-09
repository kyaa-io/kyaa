import { createG6AnalyticsRouteDependencies } from "@/server/g6/analytics-route-dependencies";
import { loadServerEnv } from "@/server/config/env";
import { createLedgerAnalyticsRepository } from "@/server/admin/ledger-analytics-repository";
import { createGetAdminWeeklyReportHandler } from "@/server/admin/web-analytics-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { authorize } = createG6AnalyticsRouteDependencies();
  const environment = loadServerEnv();
  const repository = createLedgerAnalyticsRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  return createGetAdminWeeklyReportHandler({ authorize, read: (input) => repository.weekly(input), unavailableCode: "WEEKLY_METRICS_UNAVAILABLE" })(request);
}
