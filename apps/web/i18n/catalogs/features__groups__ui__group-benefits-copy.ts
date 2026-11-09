import type { TranslatedMessage } from "../messages";

/** 261107-2 D1: the name of the 덕질 tab. B17: one word per language (es, pt, fr, id, vi use "Stan", ru "Стэн", th "แฟนคลับ"); ko, ja and zh keep their words. Change it here only. */
export const messages = {
  "navStan": {
    "ja": "推し活",
    "zh-Hans": "追星",
    "zh-Hant": "追星",
    "es": "Stan",
    "id": "Stan",
    "vi": "Stan",
    "th": "แฟนคลับ",
    "pt": "Stan",
    "fr": "Stan",
    "ru": "Стэн"
  }
} satisfies Record<string, TranslatedMessage>;
