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
export const chemiPartnerDeletedSchema = z.object({ deleted: z.boolean() });
// DELETE /profile/birth: 지운 줄 수 요약(생일 동의 철회 범위).
export const chemiBirthErasedSchema = z.object({
  askThreads: z.number().int().nonnegative(), readings: z.number().int().nonnegative(), charts: z.number().int().nonnegative(),
  partners: z.number().int().nonnegative(), profile: z.number().int().nonnegative(), chainRecords: z.number().int().nonnegative(),
});

export type ChemiProfile = z.infer<typeof chemiProfileSchema>;
export type ChemiBirthRequest = z.infer<typeof chemiBirthRequestSchema>;
