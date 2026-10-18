import { z } from "zod";
import { acquisitionChannelSchema, acquisitionLandingSchema } from "./acquisition-attribution";
import { integerMetricSchema } from "./admin-analytics";
import { webAnalyticsDaysSchema } from "./web-analytics";

const count = integerMetricSchema.superRefine((metric, context) => {
  if (Object.keys(metric).some(key => !["state", "value", "reason", "source"].includes(key)) ||
      metric.source !== "fan_product_events" ||
      (metric.state !== "available" && metric.state !== "suppressed") ||
      (metric.state === "available" && metric.value > 0 && metric.value < 5)) {
    context.addIssue({ code: "custom", message: "Invalid aggregate metric" });
  }
});
const counts = z.object({
  acquisitions: count,
  accountCreated: count,
  profileCompleted: count,
  reservationCompleted: count,
  benefitEntered: count,
}).strict();

export const acquisitionAnalyticsSchema = z.object({
  days: webAnalyticsDaysSchema,
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  totals: counts,
  rows: z.array(counts.extend({ channel: acquisitionChannelSchema, landing: acquisitionLandingSchema })).max(49),
}).strict().refine(data => Date.parse(data.from) < Date.parse(data.to), { message: "Invalid reporting window" });
export type AcquisitionAnalyticsData = z.infer<typeof acquisitionAnalyticsSchema>;
