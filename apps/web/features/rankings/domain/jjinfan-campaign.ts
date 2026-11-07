import { z } from "zod";

export const JJINFAN_CAMPAIGN_TITLE_MAX = 80;
export const JJINFAN_CAMPAIGN_DESCRIPTION_MAX = 300;

export const jjinfanCampaignInputSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(JJINFAN_CAMPAIGN_TITLE_MAX),
  description: z.string().trim().max(JJINFAN_CAMPAIGN_DESCRIPTION_MAX),
  /** Last day (KST). Absent: keep the stored date (an older admin screen); null: no end date. */
  endsOn: z.iso.date().nullable().optional(),
}).strict().refine(value => !value.enabled || value.title.length > 0, { path: ["title"] });
export type JjinfanCampaignInput = z.infer<typeof jjinfanCampaignInputSchema>;

export const jjinfanCampaignRowSchema = z.object({
  celebrityId: z.uuid(), slug: z.string(), name: z.string(), enabled: z.boolean(), title: z.string(), description: z.string(),
  updatedAt: z.string().nullable(), count: z.number().int().min(0), endsOn: z.iso.date().nullable().optional(),
});
export type JjinfanCampaignRow = z.infer<typeof jjinfanCampaignRowSchema>;
export const jjinfanCampaignListSchema = z.object({ items: z.array(jjinfanCampaignRowSchema) });
export type JjinfanCampaignList = z.infer<typeof jjinfanCampaignListSchema>;
export const jjinfanCampaignSavedSchema = z.object({ celebrityId: z.uuid(), enabled: z.boolean(), title: z.string(), description: z.string(), endsOn: z.iso.date().nullable().optional(), updatedAt: z.string() });
export type JjinfanCampaignSaved = z.infer<typeof jjinfanCampaignSavedSchema>;
