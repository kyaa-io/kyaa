import { z } from 'zod';
const evidenceUrl=z.string().trim().max(2048).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/[\u0000- \u007f]/.test(value);}catch{return false;}});
const assetIds=z.array(z.uuid()).max(3).refine(ids=>new Set(ids).size===ids.length);
// Applications saved before the operating experience question, and web clients still open during a release.
export const legacyQualificationSchema=z.object({communityName:z.string().trim().min(1).max(100),evidenceUrl,introduction:z.string().trim().min(1).max(2000),assetIds}).strict();
export const operatingExperienceSchema=z.union([z.object({hasExistingPage:z.literal(true),evidenceUrl,assetIds:assetIds.min(1)}).strict(),z.object({hasExistingPage:z.literal(false)}).strict()]);
export const qualificationSchema=z.union([operatingExperienceSchema,legacyQualificationSchema]);
export type LegacyGroupQualification = z.infer<typeof legacyQualificationSchema>;
export type GroupQualification = z.infer<typeof qualificationSchema>;
export const isLegacyQualification=(value:GroupQualification):value is LegacyGroupQualification=>'communityName' in value;
