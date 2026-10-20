import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";

export const WAVE_FANPAGE_SLUG = "kyaa-wave-fanpage";
export const WAVE_PROGRAM_KEYS = ["live-insight", "wave-quiz", "community-starts"] as const;
export const waveProgramKeySchema = z.enum(WAVE_PROGRAM_KEYS);
export type WaveProgramKey = z.infer<typeof waveProgramKeySchema>;
export const WAVE_PROGRAMS = [
  { key: "live-insight", name: "Kyaa LIVE Insight with 나영석 PD님" },
  { key: "wave-quiz", name: "Kyaa Wave Quiz" },
  { key: "community-starts", name: "Community Starts with Kyaa Wave" },
] as const;
export const waveProgramStampsSchema = z.object({ stamps: z.array(z.object({ program: waveProgramKeySchema, earnedAt: z.iso.datetime({ offset: true }) }).strict()).max(3) }).strict().refine(value => new Set(value.stamps.map(stamp => stamp.program)).size === value.stamps.length);
export function waveProgramHref(program: WaveProgramKey, locale: AppLocale) {
  return `/${WAVE_FANPAGE_SLUG}/programs/${program}?locale=${locale}`;
}
