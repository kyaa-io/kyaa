import { z } from 'zod';
import { raffleSchema } from '@/features/benefit/domain/raffle';
export const groupRaffleSchema=raffleSchema.extend({summary:z.string().max(1000)});
const consentDocumentSchema=z.object({title:z.string(),body:z.string(),documentUrl:z.string().nullable(),items:z.array(z.object({id:z.string(),label:z.string(),required:z.boolean()}))});
export const groupRaffleDetailSchema=z.object({raffle:groupRaffleSchema,enteredTickets:z.number().int().nonnegative(),winner:z.object({id:z.uuid(),status:z.enum(['information_required','submitted','fulfilled','expired']),submitBy:z.string()}).nullable(),canManage:z.boolean(),member:z.boolean(),consentVersion:z.string().nullable().optional(),canEnter:z.boolean().optional(),consentDocuments:z.object({ko:consentDocumentSchema,en:consentDocumentSchema}).nullable().optional()});
export const entryReceiptSchema=z.object({id:z.uuid(),amount:z.number().int().positive(),enteredTickets:z.number().int().positive(),tickets:z.number().int().nonnegative()});
export const pendingEntrySchema=z.object({requestId:z.uuid(),amount:z.number().int().min(1).max(10000)}).strict();
export const recipientsSchema=z.object({items:z.array(z.object({id:z.uuid(),status:z.string(),name:z.string().nullable(),phone:z.string().nullable(),address:z.string().nullable()}))});
