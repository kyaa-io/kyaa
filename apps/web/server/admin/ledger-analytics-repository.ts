import "server-only";
import type { z } from "zod";
import { createClient } from "@/server/data/client";
import { funnelAnalyticsSchema, type FunnelAnalyticsData } from "@/features/analytics/domain/funnel-analytics";
import { weeklyMetricsSchema, type WeeklyMetricsData } from "@/features/analytics/domain/weekly-metrics";
import { webAnalyticsSchema, type WebAnalyticsData, type WebAnalyticsDays } from "@/features/analytics/domain/web-analytics";

export type AdminReportInput = { adminAppUserId: string; adminAllowlistId: string; days: WebAnalyticsDays };
export type AdminWeeklyReportInput = Pick<AdminReportInput, "adminAppUserId" | "adminAllowlistId">;
export interface LedgerAnalyticsRepository {
  webTraffic(input: AdminReportInput): Promise<WebAnalyticsData>;
  funnel(input: AdminReportInput): Promise<FunnelAnalyticsData>;
  weekly(input: AdminWeeklyReportInput): Promise<WeeklyMetricsData>;
}
interface RpcClient { rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

/** Aggregates of fan_product_events; the admin is checked again in the database (assert_active_admin). */
export class SupabaseLedgerAnalyticsRepository implements LedgerAnalyticsRepository {
  constructor(private readonly database: RpcClient) {}

  private async read<T extends { days: number }>(name: string, schema: z.ZodType<T>, input: AdminReportInput): Promise<T> {
    const { data, error } = await this.database.rpc(name, {
      p_actor_app_user_id: input.adminAppUserId,
      p_actor_admin_allowlist_id: input.adminAllowlistId,
      p_days: input.days,
    });
    const parsed = schema.safeParse(data);
    if (error || !parsed.success || parsed.data.days !== input.days) throw new Error("LEDGER_ANALYTICS_UNAVAILABLE");
    return parsed.data;
  }

  webTraffic(input: AdminReportInput) { return this.read("read_admin_web_traffic", webAnalyticsSchema, input); }
  funnel(input: AdminReportInput) { return this.read("read_admin_funnel_analytics", funnelAnalyticsSchema, input); }

  async weekly(input: AdminWeeklyReportInput) {
    const { data, error } = await this.database.rpc("read_admin_weekly_metrics", {
      p_actor_app_user_id: input.adminAppUserId,
      p_actor_admin_allowlist_id: input.adminAllowlistId,
    });
    const parsed = weeklyMetricsSchema.safeParse(data);
    if (error || !parsed.success) throw new Error("LEDGER_ANALYTICS_UNAVAILABLE");
    return parsed.data;
  }
}

export function createLedgerAnalyticsRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }): LedgerAnalyticsRepository {
  const database = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return new SupabaseLedgerAnalyticsRepository(database as unknown as RpcClient);
}
