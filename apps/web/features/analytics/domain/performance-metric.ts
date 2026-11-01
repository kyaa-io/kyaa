import { z } from "zod";

export const performanceMetricSchema = z.object({
  name: z.enum(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]),
  value: z.number().finite().min(0).max(3_600_000),
  routeKind: z.enum(["home", "public-list", "public-detail", "public-info"]),
}).strict().superRefine((metric, context) => {
  if (metric.name === "CLS" && metric.value > 100) context.addIssue({ code: "custom", path: ["value"], message: "CLS out of range" });
});

export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;
