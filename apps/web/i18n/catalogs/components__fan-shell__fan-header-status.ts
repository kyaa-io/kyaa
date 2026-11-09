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
  "headerStatusChangeFavorite": {
    "ja": "推しを変更",
    "zh-Hans": "更换最爱",
    "zh-Hant": "更換最愛",
    "es": "Cambiar favorito",
    "id": "Ganti favorit",
    "vi": "Đổi thần tượng",
    "th": "เปลี่ยนคนโปรด",
    "pt": "Trocar favorito",
    "fr": "Changer de favori",
    "ru": "Сменить кумира"
  },
  "headerStatusTierGuide": {
    "ja": "ランクガイド",
    "zh-Hans": "等级指南",
    "zh-Hant": "等級指南",
    "es": "Guía de niveles",
    "id": "Panduan tingkat",
    "vi": "Hướng dẫn hạng",
    "th": "คู่มือระดับ",
    "pt": "Guia de níveis",
    "fr": "Guide des niveaux",
    "ru": "Гид по уровням"
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
  },
  "headerStatusFindFavorite": {
    "ja": "他の推しを探す",
    "zh-Hans": "寻找更多最爱",
    "zh-Hant": "尋找更多最愛",
    "es": "Buscar más favoritos",
    "id": "Cari favorit lain",
    "vi": "Tìm thêm thần tượng",
    "th": "หาคนโปรดเพิ่ม",
    "pt": "Encontrar mais favoritos",
    "fr": "Trouver d’autres favoris",
    "ru": "Найти других кумиров"
  }
} as const satisfies Record<string, TranslatedMessage>;
