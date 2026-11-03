import {z} from 'zod';
export const groupBenefitsKindSchema=z.enum(['raffles','missions']);
export const groupBenefitsQuerySchema=z.object({kind:groupBenefitsKindSchema,cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(30).default(30)}).strict();
const image=z.string().refine(value=>/^https:\/\//.test(value)||/^\/[^/\\]/.test(value)).nullable();
const common={id:z.uuid(),pageId:z.uuid(),pageName:z.string(),title:z.string(),description:z.string(),imageUrl:image};
const raffle=z.object({...common,status:z.enum(['preparing','open']),closesAt:z.string(),href:z.string().regex(/^\/pages\/groups\/[0-9a-f-]{36}\/raffles\/[0-9a-f-]{36}$/)});
const mission=z.object({...common,status:z.literal('published'),submissionKind:z.enum(['photo','survey']),rewardPoints:z.number().int().nonnegative(),href:z.string().regex(/^\/pages\/groups\/[0-9a-f-]{36}\/missions\/[0-9a-f-]{36}$/)});
export const groupBenefitsCatalogSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('raffles'),items:z.array(raffle).max(30),nextCursor:z.uuid().nullable()}),z.object({kind:z.literal('missions'),items:z.array(mission).max(30),nextCursor:z.uuid().nullable()})]);
export type GroupBenefitsCatalog=z.infer<typeof groupBenefitsCatalogSchema>;
