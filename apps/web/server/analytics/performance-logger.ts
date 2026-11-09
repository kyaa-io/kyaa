import "server-only";
import { performanceMetricSchema, type PerformanceMetric } from "@/features/analytics/domain/performance-metric";
import { z } from "zod";

export const homeQueryLabels = ["featuredLives", "celebrities", "homeBanners", "homeSlots", "elinaRaffles"] as const;
const homeQueryMetricSchema = z.object({
  name: z.enum(homeQueryLabels),
  durationMs: z.number().finite().min(0).max(3_600_000),
  outcome: z.enum(["success", "error"]),
}).strict();
export type HomeQueryMetric = z.infer<typeof homeQueryMetricSchema>;

export function logWebVital(metric: PerformanceMetric): void {
  try {
    const value = performanceMetricSchema.parse(metric);
    console.info(JSON.stringify({ event: "web_vital", ...value }));
  } catch { /* Logging is best effort, with no raw inputs or errors. */ }
}

export function logHomeQuery(metric: HomeQueryMetric): void {
  try {
    const value = homeQueryMetricSchema.parse(metric);
    console.info(JSON.stringify({ event: "home_query", ...value }));
  } catch { /* Logging must preserve the query result. */ }
}
