import { createG6AnalyticsRouteDependencies } from "@/server/g6/analytics-route-dependencies";
import { loadServerEnv } from "@/server/config/env";
import { createAcquisitionAnalyticsRepository } from "@/server/admin/acquisition-analytics-repository";
import { createGetAcquisitionAnalyticsHandler } from "@/server/admin/acquisition-analytics-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { authorize } = createG6AnalyticsRouteDependencies();
  const environment = loadServerEnv();
  const repository = createAcquisitionAnalyticsRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY });
  return createGetAcquisitionAnalyticsHandler({ authorize, repository })(request);
}
