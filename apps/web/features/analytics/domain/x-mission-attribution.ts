import { z } from 'zod';
export const kolPropertiesSchema = z.object({
 source: z.literal('x'), medium: z.literal('kol'), campaign: z.literal('kol-1113'), kol: z.string().regex(/^kol\d{2}$/),
 flowStartedAt: z.string().datetime().nullable(),
}).strict();
