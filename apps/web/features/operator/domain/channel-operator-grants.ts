import { z } from "zod";

export const channelOperatorGrantSchema = z.object({
  id: z.uuid(),
  appUserId: z.uuid(),
  email: z.string(),
  status: z.enum(["active", "revoked"]),
  grantedAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const channelOperatorListSchema = z.object({ items: z.array(channelOperatorGrantSchema) });
export const grantInputSchema = z.object({ email: z.string().trim().toLowerCase().max(254).email() }).strict();

export type ChannelOperatorGrant = z.infer<typeof channelOperatorGrantSchema>;
