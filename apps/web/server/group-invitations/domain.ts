import {z} from 'zod';
export const invitationEmailSchema=z.string().trim().max(254).pipe(z.email()).transform(value=>value.toLowerCase());
export const invitationReceiptSchema=z.object({id:z.uuid(),status:z.enum(['pending','accepted','declined','revoked','expired']),expiresAt:z.string().optional(),deliveryStatus:z.string().optional(),pageId:z.uuid().optional()}).strict();
export const invitationPreviewSchema=z.object({id:z.uuid(),status:z.enum(['pending','accepted','declined']),pageId:z.uuid(),pageName:z.string(),pageHref:z.string().regex(/^\/pages\/groups\/[a-f0-9-]{36}$/),question:z.string().nullable(),loginRequired:z.boolean(),membershipVersion:z.literal('group-membership-v1'),privacyVersion:z.string().nullable(),expiresAt:z.string()}).strict();
export const invitationListSchema=z.object({items:z.array(z.object({id:z.uuid(),status:z.string(),createdAt:z.string(),expiresAt:z.string(),recipientLabel:z.string(),deliveryStatus:z.string()}).strict())}).strict();
export type InvitationPreview=z.infer<typeof invitationPreviewSchema>;
