import { z } from 'zod';
export const qualificationSchema=z.object({communityName:z.string().trim().min(1).max(100),evidenceUrl:z.string().trim().max(2048).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/[\u0000-\u0020\u007f]/.test(value);}catch{return false;}}),introduction:z.string().trim().min(1).max(2000),assetIds:z.array(z.uuid()).max(3).refine(ids=>new Set(ids).size===ids.length)}).strict();
export type GroupQualification = z.infer<typeof qualificationSchema>;
