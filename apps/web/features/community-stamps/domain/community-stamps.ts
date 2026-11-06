import { messages as localizedMessages } from "@/i18n/catalogs/features__community-stamps__domain__community-stamps";
import { additionalLocales } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import { z } from "zod";
import { fanRewardSchema } from "../../rewards/domain/fan-reward";
import { mintFactsSchema } from "../../passport/domain/passport-read-model";

export const communityStampKindSchema = z.enum([
  "welcome",
  "first_comment",
  "first_clip",
  "wave_mission",
  "subscription",
  "support",
  "share",
  "invite",
  "daily_checkin",
  // Dukjil kinds (supabase/migrations/20261210010000_dukjil_stamp_kinds.sql). They are awarded by the server only and carry no catalog entry here.
  "post",
  "comment",
  "reaction",
  "live_reserve",
  "live_attend",
  "survey",
  "mission",
  "event_checkin",
  "event_review",
  "cheer",
  "proof",
  "quiz",
  "steady_checkin",
]);
export type CommunityStampKind = z.infer<typeof communityStampKindSchema>;
export const communityCreatorSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
export const communityStampSchema = z
  .object({
    id: z.uuid(),
    kind: communityStampKindSchema,
    celebritySlug: communityCreatorSlugSchema.nullable(),
    issuedAt: z.iso.datetime({ offset: true }),
    mint: mintFactsSchema,
  })
  .strict()
  .superRefine((stamp, ctx) => {
    // Welcome stays account-wide; a policy invite stamp may record the creator page where the friend passed screening.
    if (
      stamp.kind !== "invite" &&
      (stamp.kind === "welcome") !== (stamp.celebritySlug === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Stamp scope does not match its kind",
      });
    }
  });
export type CommunityStamp = z.infer<typeof communityStampSchema>;
// A stamp whose kind this build does not know is dropped on its own; it must never fail the whole collection.
const tolerantStampsSchema = z.array(z.unknown()).transform(items => items.flatMap(item => { const parsed = communityStampSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }));
export const communityStampCollectionSchema = z
  .object({
    stamps: tolerantStampsSchema,
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type CommunityStampCollection = z.infer<
  typeof communityStampCollectionSchema
>;
export const communityInviteRedemptionStateSchema = z.enum([
  "none",
  "registered_pending_fan_verification",
  "pending_fan_verification",
  "qualified_reward_issued",
  "registration_cancelled",
]);
export type CommunityInviteRedemptionState = z.infer<
  typeof communityInviteRedemptionStateSchema
>;
export const communityInviteSchema = z
  .object({
    code: z.string().min(6).max(32),
    redeemed: z.boolean(),
    redemptionState: communityInviteRedemptionStateSchema.exclude([
      "registered_pending_fan_verification",
    ]),
  })
  .strict();
export const communityInviteRedemptionResultSchema = z
  .object({
    state: communityInviteRedemptionStateSchema.exclude(["none"]),
  })
  .strict();
export const communityInvitationHistoryEntrySchema = z
  .object({
    id: z.uuid(),
    state: z.enum([
      "pending_fan_verification",
      "qualified_reward_issued",
      "registration_cancelled",
    ]),
    registeredAt: z.iso.datetime({ offset: true }),
    resolvedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export const communityInvitationOverviewSchema = z
  .object({
    fanRewards: z.array(fanRewardSchema).optional(),
    registeredCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    qualifiedCount: z.number().int().nonnegative(),
    history: z.array(communityInvitationHistoryEntrySchema).max(100),
  })
  .strict();
export type CommunityInvitationOverview = z.infer<
  typeof communityInvitationOverviewSchema
>;
export const socialStampMilestoneSchema = z
  .object({
    threshold: z.number().int().positive(),
    achievedAt: z.iso.datetime({ offset: true }),
    status: z.enum([
      "earned",
      "pending_configuration",
      "awarded",
      "achieved",
    ]),
  })
  .strict();
export const socialStampContentSchema = z
  .object({
    linkUrl: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => value.startsWith("/") || /^https:\/\/[^\s]+$/.test(value))
      .optional(),
    imageUrl: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => value.startsWith("/") || /^https:\/\/[^\s]+$/.test(value)),
    title: z.string().trim().min(1).max(120),
  })
  .strict();
const socialStampSectionSchema = z
  .object({
    count: z.number().int().nonnegative(),
    nextThreshold: z.number().int().positive().nullable(),
    remaining: z.number().int().nonnegative(),
    milestones: z.array(socialStampMilestoneSchema).max(100),
    content: z.array(socialStampContentSchema).max(20),
  })
  .strict()
  .superRefine((section, ctx) => {
    if (
      (section.nextThreshold === null && section.remaining !== 0) ||
      (section.nextThreshold !== null &&
        section.remaining !== Math.max(section.nextThreshold - section.count, 0))
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid social stamp progress" });
    }
  });
export const socialStampCollectionSchema = z
  .object({
    invitation: socialStampSectionSchema,
    friendship: socialStampSectionSchema,
  })
  .strict();
export type SocialStampCollection = z.infer<typeof socialStampCollectionSchema>;
export const communityShareTokenSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const communityShareLinkSchema = z
  .object({ token: communityShareTokenSchema })
  .strict();
export const communityShareDestinationSchema = z
  .object({ creator: communityCreatorSlugSchema })
  .strict();
export const sharedPassportActivitySchema = z
  .object({
    creator: communityCreatorSlugSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    ownerNickname: z
      .string()
      .min(1)
      .max(80)
      .nullable()
      .optional()
      .default(null),
    tier: z.enum(["Bronze", "Silver", "Gold", "Platinum", "Diamond"]),
    score: z.number().int().nonnegative(),
    activityCount: z.number().int().nonnegative(),
    stampCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
  })
  .strict();
export type SharedPassportActivity = z.infer<
  typeof sharedPassportActivitySchema
>;
export const communityAwardResultSchema = z
  .object({ awarded: z.boolean() })
  .strict();

const waveMissionLabels = {
  ja: ["WAVE ミッション", "WAVEミッションの完了を記録するスタンプです。"],
  "zh-Hans": ["WAVE 任务", "记录已完成的WAVE任务的印章。"],
  "zh-Hant": ["WAVE 任務", "記錄已完成的WAVE任務的印章。"],
  es: ["Misión WAVE", "Un sello que registra una misión WAVE completada."],
  id: ["Misi WAVE", "Stempel yang mencatat misi WAVE yang telah selesai."],
  vi: ["Nhiệm vụ WAVE", "Dấu ghi nhận nhiệm vụ WAVE đã hoàn thành."],
  th: ["ภารกิจ WAVE", "แสตมป์บันทึกการทำภารกิจ WAVE สำเร็จ"],
  pt: ["Missão WAVE", "Um selo que registra uma missão WAVE concluída."],
  fr: ["Mission WAVE", "Un tampon qui atteste une mission WAVE terminée."],
  ru: ["миссия WAVE", "Почтовая марка, увековечивающая завершенную миссию WAVE."],

} as const;

export const COMMUNITY_STAMPS = {
  wave_mission: {
    asset: "mission", ko: "WAVE 미션", en: "WAVE mission", scope: "creator",
    ...additionalLocales(locale => waveMissionLabels[locale][0]),
    help: { ko: "WAVE 미션 완료를 기록하는 도장이에요.", en: "A stamp recording a completed WAVE mission.", ...additionalLocales(locale => waveMissionLabels[locale][1]) },
  },
  welcome: { asset: "welcome", ko: "가입 기념", en: "Welcome", scope: "account", help: { ko: "가입하면 받는 기념 스탬프예요.", en: "A welcome Stamp for joining kyaa.",
  ...additionalLocales((translationLocale) => (localizedMessages.m1126b31a7c01[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.m2f8dbf719303[translationLocale]))
},
  first_comment: { asset: "first-comment", ko: "첫 댓글", en: "First comment", scope: "creator", help: { ko: "최애에게 첫 댓글을 남겨보세요.", en: "Leave your first comment for your favorite.",
  ...additionalLocales((translationLocale) => (localizedMessages.m57edb71ad308[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.m448150d0a8d7[translationLocale]))
},
  first_clip: {
    asset: "first-clip",
    ko: "첫 영상",
    en: "First clip",
    scope: "creator",
    help: {
      ko: "첫 팬 영상을 올리면 받아요.",
      en: "Earn this when you publish your first fan video.",
      ...additionalLocales(
        (translationLocale) =>
          localizedMessages.m0ad38e80c1c1[translationLocale],
      ),
    },
    ...additionalLocales(
      (translationLocale) => localizedMessages.m0ad38e80c1c2[translationLocale],
    ),
  },
  subscription: { asset: "subscription", ko: "구독인증", en: "Subscription", scope: "creator", help: { ko: "최애의 SNS 구독을 인증해요.", en: "Verify your subscription to your favorite.",
  ...additionalLocales((translationLocale) => (localizedMessages.m8d237ac84fe2[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.mbe6440927666[translationLocale]))
},
  support: { asset: "support", ko: "후원", en: "Support", scope: "creator", help: { ko: "최애에게 보낸 후원을 기록해요.", en: "Keep a record of your support.",
  ...additionalLocales((translationLocale) => (localizedMessages.ma73e6a2b5cc4[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.m7c0546df2eff[translationLocale]))
},
  share: { asset: "share", ko: "공유하기", en: "Share", scope: "creator", help: { ko: "패스포트 링크를 받은 다른 회원이 로그인 후 최애를 확인하면 받아요.", en: "Earn a Stamp when another member signs in and confirms a visit through your Passport link.",
  ...additionalLocales((translationLocale) => (localizedMessages.m14bb4137cf8e[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.m7f1d76d612b2[translationLocale]))
},
  invite: { asset: "invite", ko: "친구초대", en: "Invite a friend", scope: "account", help: { ko: "친구 코드를 인증하면 둘 다 받아요.", en: "Use a friend’s code to earn a Stamp together.",
  ...additionalLocales((translationLocale) => (localizedMessages.m6e987219bf15[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.m66421648262d[translationLocale]))
},
  daily_checkin: { asset: "daily-checkin", ko: "출첵", en: "Daily check-in", scope: "creator", help: { ko: "최애 캘린더에서 매일 출석해요.", en: "Check in on your favorite’s calendar each day.",
  ...additionalLocales((translationLocale) => (localizedMessages.mcec3db980a47[translationLocale]))
},
  ...additionalLocales((translationLocale) => (localizedMessages.mc47f16b546b2[translationLocale]))
},
} as const;

// External verification is not public until the matching server proof exists.
export const AVAILABLE_COMMUNITY_STAMPS: readonly (keyof typeof COMMUNITY_STAMPS)[] = ["welcome", "first_comment", "daily_checkin", "share", "invite"];
const DUKJIL_STAMP_ART = { post: "post", comment: "first-comment", reaction: "first-like", live_reserve: "reservation", live_attend: "attendance", survey: "survey", mission: "mission", event_checkin: "event-checkin", event_review: "event-review", cheer: "support", proof: "proof", quiz: "knowledge", steady_checkin: "steady-checkin" } as const;
const DUKJIL_STAMP_LABEL = { post: ["글쓰기", "Post"], comment: ["댓글", "Comment"], reaction: ["좋아요", "Like"], live_reserve: ["LIVE 예약", "LIVE reservation"], live_attend: ["LIVE 출석", "LIVE attendance"], survey: ["설문", "Survey"], mission: ["미션", "Mission"], event_checkin: ["행사 체크인", "Event check-in"], event_review: ["행사 후기", "Event review"], cheer: ["응원", "Cheer"], proof: ["인증", "Proof"], quiz: ["퀴즈", "Quiz"], steady_checkin: ["꾸준 출석", "Steady check-in"] } as const;
type DukjilStampKind = keyof typeof DUKJIL_STAMP_ART;
const isDukjilKind = (kind: CommunityStampKind): kind is DukjilStampKind => kind in DUKJIL_STAMP_ART;
export function communityStampAsset(kind: CommunityStampKind) { if (kind === "wave_mission") return "/images/credentials/v2/mission.png"; return `/images/stamps/ink-v1/${isDukjilKind(kind) ? DUKJIL_STAMP_ART[kind] : COMMUNITY_STAMPS[kind].asset}.webp`; }
/** List thumbnails keep the legacy png for the original kinds; new kinds use their registered artwork. */
export function communityStampThumb(kind: CommunityStampKind) { return isDukjilKind(kind) ? communityStampAsset(kind) : `/images/community-stamps/${COMMUNITY_STAMPS[kind].asset}.png`; }
/** Stamp name for the artwork alt text; kinds without a localized catalog entry fall back to Korean or English. */
export function communityStampLabel(kind: CommunityStampKind, locale: AppLocale) { if (isDukjilKind(kind)) return DUKJIL_STAMP_LABEL[kind][locale === "ko" ? 0 : 1]; return COMMUNITY_STAMPS[kind][locale]; }
export function communityStampKstDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    calendar: "gregory",
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
