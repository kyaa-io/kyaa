import { z } from "zod";

export const normalizeParticipationCode = (value: string) => value.replace(/[\s-]/gu, "").toUpperCase();
export const participationNameSchema = z.string().refine(value => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)).transform(value => value.trim().normalize("NFC"))
  .refine(value => Array.from(value).length >= 1 && Array.from(value).length <= 80 && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value));
export const participationInputSchema = z.object({
  code: z.string().max(128).transform(normalizeParticipationCode).pipe(z.string().regex(/^(?:[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{8,16})$/u)),
  name: participationNameSchema,
}).strict();
const receiptSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) });
export const participationResponseSchema = z.object({ participation: receiptSchema.nullable() });
export const participationAdminPageSchema = z.object({
  participants: z.array(receiptSchema.extend({ name: participationNameSchema })).max(50),
  nextCursor: z.string().nullable(),
});

export function participationQrCode(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.pathname !== "/connect/kyaa-wave/participate" || url.hash || url.searchParams.getAll("code").length !== 1) return null;
    const code = participationInputSchema.shape.code.safeParse(url.searchParams.get("code"));
    return code.success ? code.data : null;
  } catch { return null; }
}
