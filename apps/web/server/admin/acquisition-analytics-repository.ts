import "server-only";
import { createClient } from "@supabase/supabase-js";
import { acquisitionAnalyticsSchema, type AcquisitionAnalyticsData } from "@/features/analytics/domain/acquisition-analytics";
import type { WebAnalyticsDays } from "@/features/analytics/domain/web-analytics";

export interface AcquisitionAnalyticsRepository {
  read(input: { adminAppUserId: string; adminAllowlistId: string; days: WebAnalyticsDays }): Promise<AcquisitionAnalyticsData>;
}
interface RpcClient { rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

export class SupabaseAcquisitionAnalyticsRepository implements AcquisitionAnalyticsRepository {
  constructor(private readonly database: RpcClient) {}
  async read(input: Parameters<AcquisitionAnalyticsRepository["read"]>[0]) {
    const { data, error } = await this.database.rpc("read_admin_acquisition_analytics", {
      p_actor_app_user_id: input.adminAppUserId,
      p_actor_admin_allowlist_id: input.adminAllowlistId,
      p_days: input.days,
    });
    const parsed = acquisitionAnalyticsSchema.safeParse(data);
    if (error || !parsed.success || parsed.data.days !== input.days) throw new Error("ACQUISITION_ANALYTICS_UNAVAILABLE");
    return parsed.data;
  }
}

export function createAcquisitionAnalyticsRepository(config: { url: string; serviceRoleKey: string }): AcquisitionAnalyticsRepository {
  const database = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return new SupabaseAcquisitionAnalyticsRepository(database as unknown as RpcClient);
}
