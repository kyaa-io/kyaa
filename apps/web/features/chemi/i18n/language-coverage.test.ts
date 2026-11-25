import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "../../../i18n/locales";
import { getGrowthCopy } from "@/app/chemi/growth/copy";
import { getMatchCopy } from "@/app/chemi/games/match/copy";
import { getRunCopy } from "@/app/chemi/games/run/copy";
import { matchCopy } from "@/app/chemi/star/match/copy";
import { getExtraPlayCopy } from "@/features/chemi/ui/extra-play-copy";
import { chemiMyShortcutText } from "@/features/chemi/ui/copy";

/**
 * 케미 97 9회차: 케미 화면 문구가 언어마다 빠지거나(빈칸 → 한국어로 대체) 영어 복사본으로 남지 않았는지 본다.
 * 몽골어 묶음이 영어 복사본 518개였던 일을 다시 막는다. 영어와 같은 글은 이름·자리표시·같은 낱말(Saju, Solar 등)만 남는다.
 */
const hangul = /[가-힣]/;
const SAME_AS_ENGLISH_LIMIT = 30;
/** 최애 이름은 언어마다 같은 로마자 표기를 쓴다(creatorName). */
const names = new Set(["Changha", "Elina", "Yuna"]);

function strings(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value === "function" || value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => strings(child, prefix ? `${prefix}.${key}` : key));
}
const catalog = (locale: string) => JSON.parse(readFileSync(resolve(__dirname, "locales", locale, "chemi.json"), "utf8"));
const screens = (locale: (typeof APP_LOCALES)[number]) => ({
  catalog: catalog(locale),
  growth: getGrowthCopy(locale),
  match: getMatchCopy(locale),
  run: getRunCopy(locale),
  starMatch: matchCopy(locale),
  extraPlay: getExtraPlayCopy(locale),
  myShortcut: chemiMyShortcutText(locale),
});

describe("chemi screen copy in every language", () => {
  const english = new Map(strings(screens("en")));
  for (const locale of APP_LOCALES.filter((value) => value !== "ko")) {
    it(locale, () => {
      const rows = strings(screens(locale));
      expect(rows.filter(([, text]) => text.trim() === "").map(([key]) => key), "empty").toEqual([]);
      expect(rows.filter(([, text]) => hangul.test(text)).map(([key]) => key), "Korean").toEqual([]);
      if (locale === "en") return;
      const same = rows.filter(([key, text]) => english.get(key) === text && !names.has(text) && /[A-Za-z]{3}/.test(text)).map(([key]) => key);
      expect(same.length, `${locale} same as English: ${same.join(", ")}`).toBeLessThanOrEqual(SAME_AS_ENGLISH_LIMIT);
    });
  }
});

/**
 * 11회차: 저장 사주 결과의 문장 묶음(locales/{언어}/saju.json)도 언어마다 빠짐없이 있는지 본다.
 * 영어와 글자까지 같은 문장은 자리표시만 있는 틀(×{n})과 계산 엔진 이름뿐이어야 한다.
 */
describe("saju reading pack in every language", () => {
  const pack = (locale: string) => JSON.parse(readFileSync(resolve(__dirname, "locales", locale, "saju.json"), "utf8"));
  const english = new Map(strings(pack("en")));
  const words = (text: string) => text.replace(/\{\w+\}/g, "");
  for (const locale of APP_LOCALES.filter((value) => value !== "ko")) {
    it(locale, () => {
      const rows = strings(pack(locale));
      expect(rows.length).toBeGreaterThan(500);
      for (const key of english.keys()) if (!key.startsWith("changha.")) expect(rows.map(([name]) => name), key).toContain(key);
      expect(rows.filter(([key, text]) => key !== "join" && text.trim() === "").map(([key]) => key), "empty").toEqual([]);
      expect(rows.filter(([, text]) => hangul.test(text)).map(([key]) => key), "Korean").toEqual([]);
      if (locale === "en") return;
      const same = rows.filter(([key, text]) => english.get(key) === text && /[A-Za-z]{3}/.test(words(text))).map(([key]) => key);
      expect(same, `${locale} same as English`).toEqual([]);
    });
  }
});

