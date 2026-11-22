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

export const channelOperatorInvitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  status: z.enum(["pending", "accepted", "cancelled", "expired"]),
  mailStatus: z.enum(["pending", "sending", "sent", "failed", "cancelled"]),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  acceptedAt: z.iso.datetime({ offset: true }).nullable(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
});
export const channelOperatorInvitationListSchema = z.object({ items: z.array(channelOperatorInvitationSchema) });
export const invitationInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  locale: z.enum(["ko", "en"]),
}).strict();

export type ChannelOperatorInvitation = z.infer<typeof channelOperatorInvitationSchema>;
