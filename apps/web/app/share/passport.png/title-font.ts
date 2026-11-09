import type { AppLocale } from "@/i18n/locales";

/** Thai stacks vowel and tone marks, which the image renderer does not place (a tone mark after a vowel is dropped), so its headline is a picture cut with
 * a full text shaper: Noto Sans Thai 800 at 192px, tight crop, dark ink on transparent. It is drawn at a quarter of its size (48px type).
 * `text` is the headline the picture shows; title-font.test.ts fails when the catalog's Thai headline no longer matches it. */
export const TITLE_IMAGES: Partial<Record<AppLocale, { file: `public/${string}`; text: string; width: number; height: number }>> = {
  th: { file: "public/images/share/passport-title-th.png", text: "พบกับคนโปรดที่พาคุณมาที่นี่", width: 572, height: 65 },
};

/** The font that draws a language's headline in the shared-Passport link preview. Pretendard covers Latin, Cyrillic and Hangul; Japanese and Chinese
 * use a headline-only subset of Noto Sans (public/fonts/share, a few KB each) instead of a whole CJK font. */
export const PRETENDARD_BOLD = "public/fonts/pencil/PretendardUI850.ttf" as const;

const SUBSETS: Partial<Record<AppLocale, `public/${string}`>> = {
  ja: "public/fonts/share/noto-sans-ja-800-title.ttf",
  "zh-Hans": "public/fonts/share/noto-sans-zh-hans-800-title.ttf",
  "zh-Hant": "public/fonts/share/noto-sans-zh-hant-800-title.ttf",
};

export function titleFontFile(locale: AppLocale): `public/${string}` {
  return SUBSETS[locale] ?? PRETENDARD_BOLD;
}
