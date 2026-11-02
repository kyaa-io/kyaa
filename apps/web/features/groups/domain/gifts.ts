import { z } from 'zod';
export const giftStatusSchema=z.enum(['submitted','reviewing','changes_requested','approved','rejected']);
export const groupGiftSchema=z.object({id:z.uuid(),pageId:z.uuid(),pageName:z.string(),name:z.string(),imageAssetId:z.uuid(),imageUrl:z.string(),quantity:z.number().int().positive(),providerName:z.string(),fulfillmentMethod:z.enum(['digital','physical_shipping','on_site_pickup']),fulfillmentDescription:z.string(),conditions:z.string(),status:giftStatusSchema,revision:z.number().int().positive(),reason:z.string(),createdAt:z.string(),updatedAt:z.string(),reviewedAt:z.string().nullable(),reservedQuantity:z.number().int().nonnegative(),availableQuantity:z.number().int().nonnegative()});
export const groupGiftListSchema=z.object({items:z.array(groupGiftSchema),nextCursor:z.string().nullable()});
export const groupGiftDetailSchema=z.object({application:groupGiftSchema,history:z.array(z.object({revision:z.number().int().positive(),status:giftStatusSchema,reason:z.string(),createdAt:z.string()}))});
export const groupGiftReceiptSchema=z.object({id:z.uuid(),status:giftStatusSchema,revision:z.number().int().positive()});
export type GroupGift=z.infer<typeof groupGiftSchema>;
