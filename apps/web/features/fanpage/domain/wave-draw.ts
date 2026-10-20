import { z } from "zod";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";

export const WAVE_PRIZES = [
  { key: "tshirt", title: "엠블룩 의류", quantity: 15 },
  { key: "cap", title: "Chillsa 모자", quantity: 20 },
  { key: "phonecase", title: "비피오 뱅크시 폰케이스", quantity: 10 },
  { key: "hoodie", title: "뱅크시 피그먼트 후디", quantity: 3 },
  { key: "mousepad", title: "마우스 패드", quantity: 5 },
  { key: "mirror", title: "손거울", quantity: 5 },
  { key: "golf", title: "egg is coming 골프공", quantity: 5 },
  { key: "camera", title: "토롱이 레트로 디지털 카메라", quantity: 1 },
  { key: "meal", title: "DHL 식사권", quantity: 2 },
  { key: "blue", title: "조니워커 블루", quantity: 1 },
] as const;
export const wavePrizeKeySchema = z.enum(["tshirt", "cap", "phonecase", "hoodie", "mousepad", "mirror", "golf", "camera", "meal", "blue"]);
export type WavePrizeKey = z.infer<typeof wavePrizeKeySchema>;
export const wavePreferencesSchema = z.array(wavePrizeKeySchema).length(3).refine(value => new Set(value).size === 3);
export const waveDrawSummarySchema = z.object({ id: z.uuid(), executedAt: z.iso.datetime({ offset: true }), revealedThrough: z.number().int().min(0).max(10) });
const winners = z.array(z.object({ nickname: z.string().min(1), avatarUrl: publicAvatarUrlSchema }));
const results = z.array(z.object({ prizeKey: wavePrizeKeySchema, winners })).max(10);
export const waveDrawResponseSchema = z.object({
  entry: z.object({ preferences: wavePreferencesSchema, updatedAt: z.iso.datetime({ offset: true }) }).nullable(),
  tickets: z.number().int().min(0).max(10), draw: waveDrawSummarySchema.nullable(),
  result: z.discriminatedUnion("status", [z.object({ status: z.literal("won"), prizeKey: wavePrizeKeySchema }), z.object({ status: z.enum(["not_entered", "pending", "not_won"]) })]),
  published: results,
});
export type WaveDrawResponse = z.infer<typeof waveDrawResponseSchema>;
export const waveAdminDrawResponseSchema = z.object({ draw: waveDrawSummarySchema.nullable(), entryCount: z.number().int().nonnegative(), results });
