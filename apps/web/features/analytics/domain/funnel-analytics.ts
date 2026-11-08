import { z } from "zod";
import { webAnalyticsDaysSchema } from "./web-analytics";

const count = z.number().int().nonnegative();

export const FUNNEL_STEPS = ["visitors", "accountCreated", "fanVerified", "firstActivity"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const funnelAnalyticsSchema = z.object({
  days: webAnalyticsDaysSchema,
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  pageViewsSince: z.iso.datetime({ offset: true }).nullable(),
  steps: z.object({
    visitors: count,
    accountCreated: count,
    fanVerified: count,
    firstActivity: count,
  }).strict(),
}).strict().refine((data) => Date.parse(data.from) < Date.parse(data.to), { message: "Invalid reporting window" });
export type FunnelAnalyticsData = z.infer<typeof funnelAnalyticsSchema>;

/** Share of the previous step, or null when the previous step is empty or page views were not collected for the whole period. */
export function funnelRates(data: FunnelAnalyticsData): Record<FunnelStep, number | null> {
  const partialVisits = data.pageViewsSince === null || Date.parse(data.pageViewsSince) > Date.parse(data.from);
  const rate = (value: number, previous: number) => previous > 0 ? value / previous : null;
  return {
    visitors: null,
    accountCreated: partialVisits ? null : rate(data.steps.accountCreated, data.steps.visitors),
    fanVerified: rate(data.steps.fanVerified, data.steps.accountCreated),
    firstActivity: rate(data.steps.firstActivity, data.steps.fanVerified),
  };
}
