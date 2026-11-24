import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/features__creator__domain__creator-role";
import { additionalLocales } from "@/i18n/messages";
import { z } from "zod";

export const CREATOR_ROLES = ["idol", "creator", "brand", "underground_idol"] as const;
export const creatorRoleSchema = z.enum(CREATOR_ROLES);
export type CreatorRole = z.infer<typeof creatorRoleSchema>;
export type CreatorRoleFilter = CreatorRole | "all";
type Locale = AppLocale;

/** The public DTO retains its array shape, with exactly one representative role. */
export const creatorRolesSchema = z.array(creatorRoleSchema).length(1);

const underground: Record<AppLocale, string> = {
  ko: "언더아이돌", en: "Underground idol", ja: "地下アイドル", "zh-Hans": "地下偶像", "zh-Hant": "地下偶像",
  es: "Ídol underground", id: "Idola underground", vi: "Thần tượng underground", th: "ไอดอลใต้ดิน",
  pt: "Ídolo underground", fr: "Idole underground", ru: "Андеграунд-айдол", mn: "Андерграунд айдол",
};
const labels = {
  ko: { underground_idol: underground.ko, idol: "아이돌", singer: "가수", actor: "배우", creator: "크리에이터", show_host: "쇼호스트", brand: "브랜드" },
  get mn() { return this.en; },
  en: { underground_idol: underground.en, idol: "Idol", singer: "Singer", actor: "Actor", creator: "Creator", show_host: "Show host", brand: "Brand" },

  ...additionalLocales((translationLocale) => ({ underground_idol: underground[translationLocale], idol: localizedMessages.m18490cca1879[translationLocale], singer: localizedMessages.m9d242e6de73e[translationLocale], actor: localizedMessages.m7e3bf59474a7[translationLocale], creator: localizedMessages.m0e6bfe41b999[translationLocale], show_host: localizedMessages.me86e2f21a7e0[translationLocale], brand: localizedMessages.brand[translationLocale] }))
} as const;
const filterLabels = {
  ko: { all: "전체", ...labels.ko },
  get mn() { return this.en; },
  en: { all: "All", underground_idol: "Underground idols", idol: "Idols", singer: "Singers", actor: "Actors", creator: "Creators", show_host: "Show hosts", brand: "Brands" },

  ...additionalLocales((translationLocale) => ({ all: localizedMessages.mb53f545c208c[translationLocale], ...labels[translationLocale] }))
} as const;

export function creatorRoleLabel(role: CreatorRole, locale: Locale) {
  return labels[locale][role];
}

export function creatorRoleFilterLabel(role: CreatorRoleFilter, locale: Locale) {
  return filterLabels[locale][role];
}

export function parseCreatorRoleFilter(value: unknown): CreatorRoleFilter {
  const result = creatorRoleSchema.safeParse(value);
  return result.success ? result.data : "all";
}

export function matchesCreatorRole(roles: readonly CreatorRole[], filter: CreatorRoleFilter) {
  return filter === "all" || roles[0] === filter;
}

export function availableCreatorRoles(people: readonly { roles: readonly CreatorRole[] }[]) {
  return CREATOR_ROLES.filter((role) => people.some((person) => person.roles[0] === role));
}
