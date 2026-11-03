import { z } from "zod";
const prizeSchema=z.object({id:z.uuid(),name:z.string(),imageUrl:z.string().nullable(),weight:z.number().int().positive(),stock:z.number().int().nonnegative()});
export const capsuleSchema=z.object({id:z.uuid(),name:z.string(),status:z.enum(['draft','active','paused','closed']),blankWeight:z.number().int().nonnegative(),weightTotal:z.literal(1000000),prizes:z.array(prizeSchema).min(1)}).refine(x=>x.blankWeight+x.prizes.reduce((n,p)=>n+p.weight,0)===x.weightTotal);
export const capsulesSchema=z.object({items:z.array(capsuleSchema),nextCursor:z.uuid().nullable().default(null)});
export const capsuleResultSchema=z.object({requestKey:z.uuid(),campaignId:z.uuid(),count:z.union([z.literal(1),z.literal(10)]),results:z.array(z.object({index:z.number().int().min(1).max(10),prizeId:z.uuid().nullable(),name:z.string().nullable(),imageUrl:z.string().nullable()})),tickets:z.number().int().nonnegative()}).refine(x=>x.results.length===x.count&&new Set(x.results.map(r=>r.index)).size===x.count);
export const pendingCapsuleSchema=z.object({campaignId:z.uuid(),requestKey:z.uuid(),count:z.union([z.literal(1),z.literal(10)])}).strict();
export type Capsule=z.infer<typeof capsuleSchema>;
export type PendingCapsule=z.infer<typeof pendingCapsuleSchema>;
export function canDraw(capsule:Capsule,count:1|10,tickets:number){return capsule.status==='active'&&tickets>=count&&capsule.prizes.every(p=>p.stock>=count);}
