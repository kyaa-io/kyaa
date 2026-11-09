import { z } from "zod";

// Shared contract for the dukjil (fan activity) API. Source: work/local-team-20261103/tasks/PASSPORT-RENEWAL-20261105/contract.md §3.1, §3.2, §4, §5.
// Keep this file free of server-only imports so the UI can use the same types.

export const DUKJIL_ACTION_KEYS = [
  "post", "comment", "reaction", "share", "invite", "quiz", "subscription",
  "live_reserve", "live_attend", "survey", "mission", "event_checkin", "event_review", "cheer", "proof",
] as const;
export const dukjilActionKeySchema = z.enum(DUKJIL_ACTION_KEYS);
export type DukjilActionKey = z.infer<typeof dukjilActionKeySchema>;

// Error codes (plan §13.3 plus the RPC codes of contract §3). The API answers `{ error: { code } }`.
export const DUKJIL_ERROR_CODES = [
  "DUKJIL_DAILY_LIMIT", "UNKNOWN_ACTION", "POLICY_INACTIVE", "PASSPORT_REQUIRED", "SOURCE_REUSED",
  "DUKJIL_CONTENT_TOO_SHORT", "DUKJIL_DUPLICATE_BODY", "DUKJIL_REPEAT_TARGET", "DUKJIL_PARAMS_INVALID", "DUKJIL_CELEBRITY_REQUIRED", "DUKJIL_ATTENDANCE_MOVED", "COMMUNITY_STAMP_WALLET_NOT_READY", "COMMUNITY_STAMP_NOT_FOUND", "CREATOR_NOT_FOUND",
  "PASSPORT_PAGE_NOT_COMPLETE", "PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN", "PROOF_PII_DETECTED", "PROOF_MONTHLY_LIMIT", "VOUCHER_OUT_OF_STOCK",
] as const;
export const dukjilErrorCodeSchema = z.enum(DUKJIL_ERROR_CODES);
export type DukjilErrorCode = z.infer<typeof dukjilErrorCodeSchema>;
export const dukjilErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string().optional() }).strict() }).strict();

export const creatorSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
export const requestKeySchema = z.uuid();

// POST /api/me/attendance/{creatorSlug}  (§3.1)
export const attendanceRequestSchema = z.object({ requestKey: requestKeySchema }).strict();
export const attendanceResultSchema = z.object({
  points: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  bonusPoints: z.number().int().nonnegative(),
  stampId: z.uuid().nullable(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  replayed: z.boolean(),
}).strict();
export type AttendanceResult = z.infer<typeof attendanceResultSchema>;

// record_dukjil_action (§3.2). Server-internal; there is no public route by default.
export const dukjilActionInputSchema = z.object({
  actionKey: dukjilActionKeySchema,
  sourceKey: z.string().min(1).max(200),
  requestKey: requestKeySchema,
}).strict();
export const dukjilActionResultSchema = z.object({
  points: z.number().int().nonnegative(),
  stampId: z.uuid().nullable(),
  capped: z.boolean(),
  reason: z.string().nullable(),
  replayed: z.boolean(),
}).strict();
export type DukjilActionResult = z.infer<typeof dukjilActionResultSchema>;

// POST /api/me/dukjil/cheer (B3 §5.1). earned is what this tap paid: 0 on a replay (already cheered today), so a past 3P never shows as new.
export const dukjilCheerResultSchema = z.object({
  earned: z.number().int().nonnegative(), stamped: z.boolean(), replayed: z.boolean(), celebrity: z.object({ slug: creatorSlugSchema }).strict(),
}).strict();
export type DukjilCheerResult = z.infer<typeof dukjilCheerResultSchema>;

// GET /api/dukjil/catalog?locale=  (active policy rows; guide and badges share it)
export const dukjilRuleSchema = z.object({
  points: z.number().int().nonnegative().optional(),
  dailyLimit: z.number().int().nonnegative().nullable().optional(),
  stamp: z.string().nullable().optional(),
  pageStamp: z.boolean().optional(),
}).passthrough();
export const dukjilCatalogSchema = z.object({
  version: z.number().int().positive(),
  rules: z.record(z.string(), dukjilRuleSchema),
  missionBook: z.unknown(),
}).strict();
export type DukjilCatalog = z.infer<typeof dukjilCatalogSchema>;
// With no active policy the catalog is empty rather than an error, so guides and badges render nothing paid.
export const dukjilCatalogResponseSchema = z.union([dukjilCatalogSchema, z.object({ version: z.null(), rules: z.object({}).strict(), missionBook: z.null() }).strict()]);

// GET /api/me/dukjil/today?creator={slug}  (contract §15: the read_dukjil_today shape as is)
// With no active policy the server answers { kstDate, policyActive:false } only; every other field is then absent.
const kstDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dukjilTodayActionSchema = z.object({
  count: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative().nullable(),
  stamped: z.boolean(),
}).strict();
export const dukjilAttendanceStateSchema = z.object({
  attendedToday: z.boolean(),
  streak: z.number().int().nonnegative(),
  nextBonusIn: z.number().int().positive(),
}).strict();
export const dukjilTodaySchema = z.object({
  kstDate: kstDateSchema,
  policyActive: z.boolean(),
  totalPoints: z.number().int().nonnegative().optional(),
  actions: z.record(z.string(), dukjilTodayActionSchema).optional(),
  attendance: dukjilAttendanceStateSchema.nullable().optional(),
  hasPassport: z.boolean().nullable().optional(),
  /** B3: present only while the policy in effect has insta_repost. approvals* count every approval (the caps), paidMonth the paid ones. */
  instaRepost: z.object({
    status: z.enum(["pending", "accepted", "rejected", "revoked"]).nullable(), rejectCode: z.enum(["no_hashtag", "private_account", "duplicate", "unrelated"]).nullable(),
    payResult: z.enum(["paid", "point_cap", "month_cap", "account_inactive"]).nullable(),
    approvalsToday: z.number().int().nonnegative(), approvalsMonth: z.number().int().nonnegative(), paidMonth: z.number().int().nonnegative(),
  }).strict().optional(),
  /** B3: present only while the policy in effect has tier_bonus; null when no bonus is left for this creator. */
  nextTierBonus: z.object({
    tier: z.enum(["Silver", "Gold", "Platinum", "Diamond"]), points: z.number().int().nonnegative(),
    progress: z.number().int().nonnegative(), target: z.number().int().positive(),
  }).strict().nullable().optional(),
  /** r5(R12): when today's counters reset — the KST midnight after kstDate. Added by the route; optional for older answers. */
  resetAt: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type DukjilToday = z.infer<typeof dukjilTodaySchema>;

// GET /api/me/attendance?creators=slug,slug  (max 50; read_dukjil_attendance). creatorSlug is added by the server so callers can match rows.
export const DUKJIL_ATTENDANCE_MAX_CREATORS = 50;
export const dukjilAttendanceItemSchema = dukjilAttendanceStateSchema.extend({
  celebrityId: z.uuid(),
  creatorSlug: creatorSlugSchema,
  hasPassport: z.boolean(),
}).strict();
export const dukjilAttendanceListSchema = z.object({ kstDate: kstDateSchema, items: z.array(dukjilAttendanceItemSchema) }).strict();
export type DukjilAttendanceList = z.infer<typeof dukjilAttendanceListSchema>;

// GET /api/me/passports/{id}/roadmap  (PR-P2-API types.md). Pages hold 9 slots; claimable is derived from the filled count on the server.
export const PASSPORT_PAGE_SLOT_COUNT = 9;
export const passportRoadmapSlotSchema = z.object({
  slotNo: z.number().int().min(1).max(PASSPORT_PAGE_SLOT_COUNT),
  kind: z.string().min(1).nullable(),
  state: z.enum(["empty", "filled"]),
  stampId: z.uuid().nullable(),
  clearedAt: z.string().nullable(),
}).strict();
export const passportRoadmapPageSchema = z.object({
  pageNo: z.number().int().positive(),
  slots: z.array(passportRoadmapSlotSchema).length(PASSPORT_PAGE_SLOT_COUNT),
  filled: z.number().int().min(0).max(PASSPORT_PAGE_SLOT_COUNT),
  claimable: z.boolean(),
  claimed: z.boolean(),
  locked: z.boolean(),
  lockedReason: z.enum(["jjinfan_required"]).nullable(),
}).strict();
export const passportRoadmapSchema = z.object({
  passportId: z.uuid(),
  celebrityId: z.uuid(),
  hearts: z.number().int().nonnegative(),
  jjinfan: z.boolean().optional(),
  pages: z.array(passportRoadmapPageSchema),
}).strict();
export type PassportRoadmapSlot = z.infer<typeof passportRoadmapSlotSchema>;
export type PassportRoadmapPage = z.infer<typeof passportRoadmapPageSchema>;
export type PassportRoadmap = z.infer<typeof passportRoadmapSchema>;

// POST /api/me/passports/{id}/pages/{pageNo}/claim
export const passportClaimRequestSchema = z.object({ requestKey: requestKeySchema }).strict();
export const passportClaimResultSchema = z.object({
  hearts: z.literal(1),
  pageNo: z.number().int().positive(),
  jjinfanConfirmed: z.boolean(),
  cheerStampId: z.uuid().nullable(),
  replayed: z.boolean(),
}).strict();
export type PassportClaimResult = z.infer<typeof passportClaimResultSchema>;

// Room list entry state (contract §3.8). The room stays visible; only the enter button depends on it.
export const ROOM_ENTRY_REASONS = ["ok", "stage_low", "jjinfan_required", "not_member"] as const;
export const roomEntryReasonSchema = z.enum(ROOM_ENTRY_REASONS);
export type RoomEntryReason = z.infer<typeof roomEntryReasonSchema>;
