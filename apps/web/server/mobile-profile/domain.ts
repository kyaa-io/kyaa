import { z } from "zod";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";
import { celebritySlugSchema } from "@/features/fanpage/domain/community";

const uuid = z.uuid();
const dateTime = z.iso.datetime({ offset: true });
const safeImageUrl = z
  .string()
  .min(1)
  .max(2000)
  .refine((value) => value.startsWith("/") || value.startsWith("https://"));

export const mobileAccountLevelSchema = z
  .object({
    ruleVersion: z.literal("favorite-xp-sum-v1"),
    status: z.literal("configured"),
    tier: z.enum(["Bronze", "Silver", "Gold", "Platinum", "Diamond"]),
    xp: z.number().int().nonnegative(),
    progress: z.unknown(),
  })
  .strict();

export const mobileFavoriteSchema = z
  .object({
    slug: celebritySlugSchema,
    name: z.string().min(1).max(120),
    imageUrl: safeImageUrl,
  })
  .strict();
export const mobileActivitySchema = z
  .object({
    id: uuid,
    kind: z.enum(["fan_activity", "fan_post"]),
    favorite: mobileFavoriteSchema,
    title: z.string().min(1).max(200),
    occurredAt: dateTime,
    thumbnailUrl: safeImageUrl.nullable(),
    target: z
      .object({
        type: z.enum(["passport", "live", "fan_post", "none"]),
        id: z.string().min(1).max(160).nullable(),
      })
      .strict(),
    isPublic: z.boolean(),
  })
  .strict();

export const mobileProfileSummarySchema = z
  .object({
    profile: z
      .object({
        nickname: z.string().max(80).nullable(),
        avatarUrl: publicAvatarUrlSchema,
        preferredFavorite: mobileFavoriteSchema.nullable(),
      })
      .strict(),
    counts: z
      .object({
        stamps: z.number().int().nonnegative(),
        friends: z.number().int().nonnegative(),
        goods: z.number().int().nonnegative(),
      })
      .strict(),
    passports: z
      .object({
        count: z.number().int().nonnegative(),
        stampCount: z.number().int().nonnegative(),
      })
      .strict(),
    recentActivity: mobileActivitySchema.nullable(),
    accountLevel: mobileAccountLevelSchema,
  })
  .strict();

const mobileFavoritePassportSchema = z
  .object({
    id: uuid,
    kind: z.literal("favorite"),
    favorite: mobileFavoriteSchema,
    stampCount: z.number().int().nonnegative(),
    issuedAt: dateTime,
    fanXp: z.number().int().nonnegative(),
    fanTier: z.string().min(1).max(40),
    progress: z.unknown(),
  })
  .strict();
const mobileDefaultPassportSchema = z
  .object({
    id: uuid,
    kind: z.literal("default"),
    name: z.literal("ByUs"),
    imageUrl: safeImageUrl,
    ownerNickname: z.string().max(80).nullable(),
    passportNumber: z.string().regex(/^BU [0-9]{6,}$/),
    stampCount: z.number().int().min(0).max(2),
    issuedAt: dateTime,
  })
  .strict();
export const mobilePassportSchema = z.discriminatedUnion("kind", [
  mobileDefaultPassportSchema,
  mobileFavoritePassportSchema,
]);
export const mobilePassportListSchema = z
  .object({ passports: z.array(mobilePassportSchema).max(200) })
  .strict();

export const mobileDefaultPassportDetailSchema = mobileDefaultPassportSchema
  .omit({ stampCount: true })
  .extend({
    stamps: z
      .array(
        z
          .object({
            id: uuid,
            kind: z.enum(["friend", "invite"]),
            title: z.string().min(1).max(120),
            issuedAt: dateTime,
          })
          .strict(),
      )
      .max(2),
  })
  .strict();

export const mobileActivityPageSchema = z
  .object({
    items: z.array(mobileActivitySchema).max(30),
    nextCursor: z
      .object({
        at: dateTime,
        id: uuid,
        kind: z.enum(["fan_activity", "fan_post"]),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const mobileFavoriteLevelSchema = z
  .object({
    favorite: mobileFavoriteSchema,
    xp: z.number().int().nonnegative(),
    tier: z.string().min(1).max(40),
    rank: z.number().int().positive(),
    participantCount: z.number().int().positive(),
    activityDays: z.number().int().nonnegative().optional().default(0),
    neighbors: z
      .array(
        z
          .object({
            rank: z.number().int().positive(),
            nickname: z.string().min(1).max(80),
            avatarUrl: publicAvatarUrlSchema,
            points: z.number().int().nonnegative(),
            isMe: z.boolean(),
          })
          .strict(),
      )
      .max(3)
      .optional()
      .default([]),
    progress: z.unknown(),
  })
  .strict();
export const mobileLevelsSchema = z
  .object({
    accountLevel: mobileAccountLevelSchema,
    favorites: z.array(mobileFavoriteLevelSchema).max(200),
  })
  .strict();

export const mobileStampPresentationSchema = z
  .object({
    title: z.string().min(1).max(160),
    startsAt: dateTime,
    heroImageUrl: safeImageUrl,
    heroAlt: z.string().min(1).max(300),
    location: z.string().min(1).max(300).nullable(),
    sourceState: z.literal("available"),
    liveSlug: celebritySlugSchema,
    eventId: uuid,
    favoriteSlug: celebritySlugSchema,
  })
  .strict()
  .nullable();

export const mobileStampOpportunitiesSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            kind: z.enum(["first_friend", "invite", "first_clip"]),
            earned: z.boolean(),
            target: z
              .object({
                type: z.enum(["friends", "invitations", "fan_clips", "passports"]),
                id: celebritySlugSchema.nullable(),
              })
              .strict(),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

export const mobilePassportPresentationSchema = z
  .object({
    liveRecords: z
      .array(
        z
          .object({
            stampId: uuid,
            title: z.string().min(1).max(160),
            startsAt: dateTime,
            heroImageUrl: safeImageUrl,
            heroAlt: z.string().min(1).max(300),
            stampCount: z.number().int().positive(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

export const mobilePassportShareInputSchema = z
  .object({
    includeNickname: z.boolean(),
    includePublicStamps: z.boolean(),
  })
  .strict();
export const mobilePassportShareSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .strict();

export const mobileActivityCursorSchema = z
  .object({
    at: dateTime,
    id: uuid,
    kind: z.enum(["fan_activity", "fan_post"]),
  })
  .strict();
