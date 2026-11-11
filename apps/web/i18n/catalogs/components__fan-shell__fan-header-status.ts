import type { TranslatedMessage } from "../messages";

export const messages = {
  "headerStatusStatus": {
    "ja": "推し活状況",
    "zh-Hans": "我的追星动态",
    "zh-Hant": "我的追星動態",
    "es": "Mi actividad fan",
    "id": "Aktivitas penggemar saya",
    "vi": "Hoạt động người hâm mộ",
    "th": "กิจกรรมแฟนของฉัน",
    "pt": "Minha atividade de fã",
    "fr": "Mon activité de fan",
    "ru": "Моя фан-активность"
  },
  "headerStatusHearts": {
    "ja": "ハート",
    "zh-Hans": "爱心",
    "zh-Hant": "愛心",
    "es": "Corazones",
    "id": "Hati",
    "vi": "Tim",
    "th": "หัวใจ",
    "pt": "Corações",
    "fr": "Cœurs",
    "ru": "Сердца"
  }
} as const satisfies Record<string, TranslatedMessage>;
