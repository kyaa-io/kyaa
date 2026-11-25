/**
 * 한국어 밖 언어로 사주 풀이 문장을 만드는 도구. 계산 값(원국·세운·월운)은 그대로 두고 문장만 언어 묶음에서 고른다.
 * 한국어 화면은 이 도구 없이(tx 없음) 기존 문장을 그대로 쓴다. 용어는 terms-i18n.ts 한 표, 문장은 locales/{언어}/saju.json.
 */
import type { AppLocale } from "@/i18n/locales";
import { stemHanja, branchHanja, type Pillar } from "./chart";
import { sajuTerms, type SajuTerms, type TermLocale } from "./terms-i18n";

export type SajuPack = typeof import("@/features/chemi/i18n/locales/en/saju.json");
type Values = Record<string, string | number>;

export type Tx = {
  locale: TermLocale;
  p: SajuPack;
  t: SajuTerms;
  /** 문장 틀에 값을 끼운다. */
  f: (key: keyof SajuPack["s"], values?: Values) => string;
  /** 문장 여러 개를 그 언어의 띄어쓰기로 잇는다. */
  join: (sentences: readonly string[]) => string;
  /** 이름 여러 개를 그 언어의 '와'로 잇는다. */
  list: (items: readonly string[]) => string;
  /** 그 시각(한국 시간)의 달 이름과 날짜. */
  month: (at: number) => string;
  date: (at: number) => string;
  pillar: (pillar: Pillar) => string;
  hanja: (pillar: Pillar) => string;
};

export const fill = (template: string, values: Values = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

export function sajuTx(locale: AppLocale, pack: SajuPack | null | undefined): Tx | null {
  if (locale === "ko" || !pack) return null;
  const t = sajuTerms(locale);
  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const month = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Seoul", month: "long" });
  const date = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  return {
    locale,
    p: pack,
    t,
    f: (key, values) => fill(pack.s[key], values),
    join: (sentences) => sentences.filter(Boolean).join(pack.join),
    list: (items) => list.format(items),
    month: (at) => month.format(at),
    date: (at) => date.format(at),
    pillar: (pillar) => t.pillarName(pillar.heavenlyStem, pillar.earthlyBranch),
    hanja: (pillar) => `${stemHanja[pillar.heavenlyStem]}${branchHanja[pillar.earthlyBranch]}`,
  };
}
