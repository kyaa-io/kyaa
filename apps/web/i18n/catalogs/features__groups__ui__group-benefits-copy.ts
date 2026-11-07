import type { TranslatedMessage } from "../messages";

/** 261107-2 D1: the name of the 덕질 tab. English is "Stan"; the other languages keep the earlier words. Change it here only. */
export const messages = {
  "navStan": {
    "ja": "推し活",
    "zh-Hans": "追星",
    "zh-Hant": "追星",
    "es": "Actividades de fans",
    "id": "Aktivitas penggemar",
    "vi": "Hoạt động người hâm mộ",
    "th": "กิจกรรมแฟนคลับ",
    "pt": "Atividades de fãs",
    "fr": "Activités de fans",
    "ru": "Фан-активности"
  }
} satisfies Record<string, TranslatedMessage>;
