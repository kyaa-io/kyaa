import { z } from "zod";
import { levelSchema } from "@/features/passport/domain/passport-read-model";

export const publicAuthorTierSchema = levelSchema;
export type PublicAuthorTier = z.infer<typeof publicAuthorTierSchema>;

export const authorTierRequestHeaders = { "X-Kyaa-Author-Tiers": "1" } as const;
