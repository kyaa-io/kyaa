import { z } from "zod";
export const applicationStatusSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["fan", "hobby", "brand"]),
  name: z.string(),
  status: z.enum(["submitted", "reviewing", "changes_requested", "approved", "rejected"]),
  reason: z.string().nullable(),
  pageId: z.uuid().nullable(),
  pageSlug: z.string().nullable(),
  submissionRevision: z.number().int().min(1),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
});
export const applicationStatusListSchema = z.object({ items: z.array(applicationStatusSchema) });
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
