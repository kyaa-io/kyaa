import { createG6AnalyticsRouteDependencies } from "@/server/g6/analytics-route-dependencies";
import { loadServerEnv } from "@/server/config/env";
import { createLedgerAnalyticsRepository } from "@/server/admin/ledger-analytics-repository";
import { createGetAdminLedgerReportHandler } from "@/server/admin/web-analytics-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { authorize } = createG6AnalyticsRouteDependencies();
  const environment = loadServerEnv();
  const repository = createLedgerAnalyticsRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  return createGetAdminLedgerReportHandler({ authorize, read: (input) => repository.funnel(input), unavailableCode: "FUNNEL_ANALYTICS_UNAVAILABLE" })(request);
}
