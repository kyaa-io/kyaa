import { z } from "zod";

// 케미 프로필 API 계약(설계 arch-chemi r3 §3: GET /profile · PUT·DELETE /profile/birth · POST·DELETE /partners).
// 요청은 엄격하게, 응답은 SQL 함수(chemi_read_profile 등)가 돌려주는 꼴 그대로 검사한다.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value));
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const chemiCalendarSchema = z.enum(["solar", "lunar", "lunar_leap"]);
export const chemiTimePrecisionSchema = z.enum(["exact", "band", "unknown"]);
export const chemiGenderSchema = z.enum(["female", "male"]);

const birthFields = {
  birthDate: isoDate,
  calendar: chemiCalendarSchema,
  birthTime: hhmm.nullable(),
  timePrecision: chemiTimePrecisionSchema,
  gender: chemiGenderSchema.nullable(),
};
const timeMatchesPrecision = (value: { birthTime: string | null; timePrecision: string }) => (value.timePrecision === "unknown") === (value.birthTime === null);

export const chemiBirthRequestSchema = z.object({
  ...birthFields,
  birthPlace: z.string().trim().min(1).max(80).nullable(),
  consent: z.literal(true),
}).strict().refine(timeMatchesPrecision);

export const chemiPartnerCreateSchema = z.object({
  ...birthFields,
  nickname: z.string().trim().min(1).max(20),
  source: z.enum(["saju", "star", "friend_today"]),
}).strict().refine(timeMatchesPrecision);

export const chemiPartnerUpdateSchema = z.object({
  partnerId: z.uuid(),
  ...birthFields,
  nickname: z.string().trim().min(1).max(20),
}).strict().refine(timeMatchesPrecision);

export const chemiPartnerDeleteSchema = z.object({ partnerId: z.uuid() }).strict();

export const chemiAgeBandSchema = z.enum(["adult", "minor"]);

export const chemiProfileSchema = z.object({
  birth: z.object({
    ...birthFields,
    birthPlace: z.string().nullable(),
    ageBand: chemiAgeBandSchema,
    editableFrom: z.string().nullable(),
  }).nullable(),
  consent: z.object({ version: z.string(), at: z.string() }).nullable(),
  partners: z.array(z.object({
    id: z.uuid(), nickname: z.string(), ...birthFields, source: z.enum(["saju", "star", "friend_today"]), lastUsedAt: z.string(),
  })),
  partnerLimit: z.literal(10),
});

export const chemiBirthSavedSchema = z.object({
  ageBand: chemiAgeBandSchema, saved: z.boolean(), edited: z.boolean(), editableFrom: z.string().nullable(),
});
export const chemiPartnerCreatedSchema = z.object({ partnerId: z.uuid() });
export const chemiPartnerUpdatedSchema = z.object({ updated: z.boolean() });
export const chemiPartnerDeletedSchema = z.object({ deleted: z.boolean() });
// DELETE /profile/birth: 지운 줄 수 요약(생일 동의 철회 범위).
export const chemiBirthErasedSchema = z.object({
  askThreads: z.number().int().nonnegative(), readings: z.number().int().nonnegative(), charts: z.number().int().nonnegative(),
  partners: z.number().int().nonnegative(), profile: z.number().int().nonnegative(), chainRecords: z.number().int().nonnegative(),
});

// chemi_my_birth_summary: 지우기 확인에 보여 줄 건수(지워지는 것과 남는 것)와 '쓰는 곳' 상태.
export const chemiBirthSummarySchema = z.object({
  readingDays: z.number().int().nonnegative(), askThreads: z.number().int().nonnegative(), partners: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(), askPassesLeft: z.number().int().nonnegative(),
  sajuReading: z.boolean(), fortuneToday: z.boolean(), starToday: z.boolean(),
});

// 생일의 해(을해년 · 돼지띠)와 그 해 천간의 오행. 입춘 날 시간을 모르면 해가 정해지지 않아 null.
export const chemiBirthMarkSchema = z.object({
  stem: z.string(), branch: z.string(), animal: z.string(), element: z.enum(["wood", "fire", "earth", "metal", "water"]),
}).nullable();

// GET /profile 응답: SQL 의 프로필에 서버가 계산한 생일 표지와 화면 요약을 더한다.
export const chemiProfileResponseSchema = chemiProfileSchema.extend({ birthMark: chemiBirthMarkSchema, summary: chemiBirthSummarySchema });

export type ChemiProfile = z.infer<typeof chemiProfileSchema>;
export type ChemiProfileResponse = z.infer<typeof chemiProfileResponseSchema>;
export type ChemiBirthMark = z.infer<typeof chemiBirthMarkSchema>;
export type ChemiBirthSummary = z.infer<typeof chemiBirthSummarySchema>;
export type ChemiBirthRequest = z.infer<typeof chemiBirthRequestSchema>;
