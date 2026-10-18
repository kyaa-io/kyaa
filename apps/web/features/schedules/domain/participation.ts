import { z } from "zod";
import { scheduleInstant } from "./schedule-time";

export const uuid = z.string().uuid();
export const instant = z.iso.datetime({ offset: true });
export const contentLocale = z.enum(["ko", "en"]);
export const scheduleKind = z.enum(["broadcast", "concert", "birthday", "event"]);
export const reviewStatus = z.enum(["pending", "approved", "rejected"]);
export const creatorSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
export const httpsUrl = z.string().trim().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && /^https:\/\/[A-Za-z0-9.-]+(?:\/[^\s]*)?$/.test(value); } catch { return false; }
}, "Use an HTTPS URL without credentials or a custom port");
export const canonicalTimeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")];
export const timeZone = z.string().min(1).max(100).transform((value, context) => {
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { context.addIssue({ code: "custom", message: "Invalid time zone" }); return z.NEVER; }
});
const localInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
function localDateTimeToInstant(value: string, zone: string) {
  try { return scheduleInstant(value, zone); } catch { throw new Error("FAN_WEB_LOCAL_TIME_INVALID"); }
}
const text = (max: number) => z.string().trim().max(max);
const title = text(160).min(1);
const common = { kind: scheduleKind, startsAt: instant, timeZone,
  location: text(300), participationInstructions: text(2000) };
const ordered = (value: { startsAt: string; endsAt?: string | null }) => value.endsAt == null || Date.parse(value.startsAt) < Date.parse(value.endsAt);
export const scheduleInputSchema = z.object({ kind: scheduleKind, celebritySlug: creatorSlug, title, startsAt: instant.optional(), startsAtLocal: localInstant.optional(),
  endsAt: instant.nullable().optional(), endsAtLocal: localInstant.nullable().optional(), timeZone, isOnline: z.boolean().optional(), location: text(300),
  participationInstructions: text(2000), description: text(4000), sourceUrl: httpsUrl.nullable().optional(), locale: contentLocale, idempotencyKey: uuid }).strict()
  .superRefine((value, context) => {
    if ((value.startsAt === undefined) === (value.startsAtLocal === undefined)) context.addIssue({ code: "custom", message: "Provide one start time" });
    if (value.endsAt !== undefined && value.endsAtLocal !== undefined) context.addIssue({ code: "custom", message: "Provide one end time" });
    try {
      const startsAt = value.startsAtLocal === undefined ? value.startsAt : localDateTimeToInstant(value.startsAtLocal, value.timeZone);
      const endsAt = value.endsAtLocal === undefined ? value.endsAt : value.endsAtLocal === null ? null : localDateTimeToInstant(value.endsAtLocal, value.timeZone);
      if (startsAt && !ordered({ startsAt, endsAt })) throw new Error();
    } catch { context.addIssue({ code: "custom", message: "FAN_WEB_LOCAL_TIME_INVALID" }); }
  }).transform(value => {
    const { startsAtLocal, endsAtLocal, ...rest } = value;
    const startsAt = startsAtLocal === undefined ? value.startsAt! : localDateTimeToInstant(startsAtLocal, value.timeZone);
    const endsAt = endsAtLocal === undefined ? value.endsAt : endsAtLocal === null ? null : localDateTimeToInstant(endsAtLocal, value.timeZone);
    return { ...rest, startsAt, endsAt };
  });
export const scheduleWriteSchema = z.object({ ...common, celebrityId: uuid, endsAt: instant,
  title: z.object({ ko: title, en: title }).strict(), description: z.object({ ko: text(4000), en: text(4000) }).strict(),
  officialSourceUrl: httpsUrl, status: z.enum(["draft", "published", "cancelled"]) }).strict().refine(ordered, "End must follow start");
export const artistLinkSchema = z.object({ slug: creatorSlug, name: z.string(), imageUrl: z.string(), href: z.string().startsWith("/") }).strict();
export const scheduleSchema = z.object({ ...common, endsAt: instant, id: uuid, celebrityId: uuid, celebritySlug: creatorSlug, celebrityName: z.string(),
  title, description: z.string(), officialSourceUrl: httpsUrl, status: z.enum(["published", "cancelled"]), revision: z.number().int().positive(),
  subscribed: z.boolean().nullable(), detailHref: z.string().startsWith("/live/calendar/schedules/") }).strict();
export const officialScheduleImportSchema = scheduleSchema.pick({
  kind: true, title: true, startsAt: true, endsAt: true, timeZone: true,
  location: true, participationInstructions: true, description: true,
  officialSourceUrl: true,
}).strict();
export const schedulePlaceSchema = z.object({ name: z.string().trim().min(1).max(300) }).strict();
export const schedulePlacesSchema = z.object({ places: z.array(schedulePlaceSchema).max(20) }).strict();
export const adminScheduleSchema = scheduleWriteSchema.safeExtend({ id: uuid, celebritySlug: creatorSlug, revision: z.number().int().positive(), createdAt: instant, updatedAt: instant });
export const suggestionSchema = z.object({ ...common, endsAt: instant.nullable(), isOnline: z.boolean(), id: uuid, celebritySlug: creatorSlug.nullable(), title, description: z.string(), sourceUrl: httpsUrl.nullable(),
  locale: contentLocale, status: reviewStatus, revision: z.number().int().positive(), reviewReason: z.string().nullable(), reviewedAt: instant.nullable(),
  scheduleId: uuid.nullable(), scheduleHref: z.string().startsWith("/").nullable(), createdAt: instant }).strict();
export function socialProfileKey(value: string): string | null {
  const patterns: [RegExp, string, boolean][] = [
    [/^https:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?$/, "instagram:", true],
    [/^https:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{1,24})\/?$/, "tiktok:", true],
    [/^https:\/\/(?:www\.)?youtube\.com\/@([A-Za-z0-9_.-]{3,30})\/?$/, "youtube:@", true],
    [/^https:\/\/(?:www\.)?youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/, "youtube:channel:", false],
    [/^https:\/\/chzzk\.naver\.com\/([a-fA-F0-9]{32})\/?$/, "chzzk:", true],
  ];
  for (const [pattern, prefix, lower] of patterns) {
    const match = value.match(pattern);
    if (match) {
      if (prefix === "instagram:" && ["p", "reel", "reels", "stories", "explore", "accounts"].includes(match[1].toLowerCase())) return null;
      return prefix + (lower ? match[1].toLowerCase() : match[1]);
    }
  }
  return null;
}
export const fanpageCheckSchema = z.object({ name: text(120).min(1), officialSocialUrl: httpsUrl.refine(value => socialProfileKey(value) !== null), locale: contentLocale }).strict();
export const fanpageCheckResultSchema = z.object({ existingFanpage: artistLinkSchema.nullable(), possibleMatches: z.array(artistLinkSchema).max(5), artists: z.array(artistLinkSchema).max(5) }).strict();
export const fanpageInputSchema = fanpageCheckSchema.extend({ subjectType: z.enum(["artist", "creator", "brand"]).default("artist"), note: text(2000), idempotencyKey: uuid });
export const fanpageRequestSchema = z.object({ id: uuid, name: text(120).min(1), subjectType: z.enum(["artist", "creator", "brand"]), officialSocialUrl: httpsUrl, note: z.string(), locale: contentLocale,
  status: reviewStatus, revision: z.number().int().positive(), reviewReason: z.string().nullable(), reviewedAt: instant.nullable(), artist: artistLinkSchema.nullable(), createdAt: instant }).strict();
export const liveSubmissionSettingsSchema = z.object({ accepting: z.boolean(), closesAt: instant.nullable(), visibility: z.enum(["public", "members"]), revision: z.number().int().nonnegative() }).strict();
export const ownedLiveSubmissionSchema = z.object({ id: uuid, kind: z.enum(["question", "cheer"]), body: z.string().nullable(), status: z.enum(["submitted", "selected", "hidden"]), revision: z.number().int().positive(), createdAt: instant, selectedAt: instant.nullable(), deletedAt: instant.nullable() }).strict();
export const liveSubmissionSchema = z.object({ id: uuid, kind: z.enum(["question", "cheer"]), body: z.string(), nickname: z.string(), avatarUrl: z.string(), createdAt: instant, selectedAt: instant, revision: z.number().int().positive(), isOwner: z.boolean() }).strict();
export const adminLiveSubmissionSchema = ownedLiveSubmissionSchema.extend({ nickname: z.string(), avatarUrl: z.string() });
export const liveSubmissionInputSchema = z.object({ kind: z.enum(["question", "cheer"]), body: text(1000).min(1), idempotencyKey: uuid }).strict();
export const cursorSchema = z.object({ at: instant, id: uuid }).strict();
export const rpcPage = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).max(100), nextCursor: cursorSchema.nullable() }).strict();
export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).max(100), nextCursor: z.string().nullable() }).strict();
export const mutationSchema = <T extends z.ZodType>(item: T) => z.object({ item, replayed: z.boolean() }).strict();
export const liveSubmissionsPageSchema = pageSchema(liveSubmissionSchema).extend({ settings: liveSubmissionSettingsSchema, access: z.enum(["public", "member", "members_required"]), mine: z.array(ownedLiveSubmissionSchema).max(2) });
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type ScheduleWrite = z.infer<typeof scheduleWriteSchema>;
export type AdminSchedule = z.infer<typeof adminScheduleSchema>;
export type ScheduleSuggestion = z.infer<typeof suggestionSchema>;
export type FanpageRequest = z.infer<typeof fanpageRequestSchema>;
export type LiveSubmissionsPage = z.infer<typeof liveSubmissionsPageSchema>;
export type AdminLiveSubmission = z.infer<typeof adminLiveSubmissionSchema>;
