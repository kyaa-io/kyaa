import { z } from "zod";
import { celebritySlugSchema } from "@/features/fanpage/domain/community";
import { FAN_BIO_MAX, FAN_SNS_LINKS_MAX, FAN_SNS_URL_MAX, parseFanBio, parseFanSnsUrl } from "./sns-link";

const creatorSchema = z.object({ slug: celebritySlugSchema, name: z.string().min(1).max(120) }).strict();
const snsUrlSchema = z.string().max(FAN_SNS_URL_MAX).refine(value => parseFanSnsUrl(value) === value);
const linksSchema = z.array(snsUrlSchema).max(FAN_SNS_LINKS_MAX);
const bioSchema = z.string().min(1).max(FAN_BIO_MAX * 2).refine(value => parseFanBio(value) === value);

/** What another signed-in fan sees. Strict: a field SQL adds later fails closed instead of reaching another fan. */
export const socialProfileCardSchema = z.object({
  favorite: creatorSchema.nullable(),
  links: linksSchema,
  bio: bioSchema.nullable(),
  stats: z.object({
    creator: creatorSchema,
    tier: z.string().min(1).max(40).nullable(),
    points: z.number().int().nonnegative(),
    stamps: z.number().int().nonnegative(),
    hearts: z.number().int().nonnegative(),
  }).strict().nullable(),
}).strict();
export type SocialProfileCard = z.infer<typeof socialProfileCardSchema>;

/** The fan's own fields and the creators they may name as their favorite. */
export const ownedFanProfilePublicSchema = z.object({
  favorite: creatorSchema.nullable(),
  links: linksSchema,
  bio: bioSchema.nullable(),
  favoriteOptions: z.array(creatorSchema).max(500),
}).strict();
export type OwnedFanProfilePublic = z.infer<typeof ownedFanProfilePublicSchema>;

export const ownedFanProfilePublicInputSchema = z.object({
  favoriteSlug: celebritySlugSchema.nullable(),
  links: z.array(z.string().max(FAN_SNS_URL_MAX + 20)).max(FAN_SNS_LINKS_MAX).transform((values, context) => {
    const links: string[] = [];
    for (const value of values) {
      if (!value.trim()) continue;
      const parsed = parseFanSnsUrl(value);
      if (!parsed) { context.addIssue({ code: "custom", message: "invalid sns url" }); return z.NEVER; }
      if (links.some(link => link.toLowerCase() === parsed.toLowerCase())) { context.addIssue({ code: "custom", message: "duplicate sns url" }); return z.NEVER; }
      links.push(parsed);
    }
    return links;
  }),
  bio: z.string().max(FAN_BIO_MAX * 4).nullable().transform((value, context) => {
    if (value === null) return null;
    const parsed = parseFanBio(value);
    if (parsed === undefined) { context.addIssue({ code: "custom", message: "invalid bio" }); return z.NEVER; }
    return parsed;
  }),
}).strict();
export type OwnedFanProfilePublicInput = z.input<typeof ownedFanProfilePublicInputSchema>;
