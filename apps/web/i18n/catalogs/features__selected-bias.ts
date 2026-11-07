import type { TranslatedMessage } from "../messages";

export const messages = {
  "biasChoose": { "ja": "推しを選ぶ", "zh-Hans": "选择我的最爱", "zh-Hant": "選擇我的最愛", "es": "Elegir favorito", "id": "Pilih favorit", "vi": "Chọn thần tượng", "th": "เลือกคนโปรด", "pt": "Escolher favorito", "fr": "Choisir un favori", "ru": "Выбрать кумира" },
  "biasMine": { "ja": "私の推し", "zh-Hans": "我的最爱", "zh-Hant": "我的最愛", "es": "Mis favoritos", "id": "Favorit saya", "vi": "Thần tượng của tôi", "th": "คนโปรดของฉัน", "pt": "Meus favoritos", "fr": "Mes favoris", "ru": "Мои кумиры" },
  "biasFindMore": { "ja": "他の推しを探す", "zh-Hans": "寻找更多最爱", "zh-Hant": "尋找更多最愛", "es": "Buscar más favoritos", "id": "Cari favorit lain", "vi": "Tìm thêm thần tượng", "th": "หาคนโปรดเพิ่ม", "pt": "Encontrar mais favoritos", "fr": "Trouver d’autres favoris", "ru": "Найти других кумиров" },
  "biasCurrent": { "ja": "推し {0}、ランク {1}。押して変更", "zh-Hans": "我的最爱 {0}，等级 {1}。点击更改", "zh-Hant": "我的最愛 {0}，等級 {1}。點擊更改", "es": "Favorito {0}, nivel {1}. Pulsa para cambiar", "id": "Favorit {0}, tingkat {1}. Tekan untuk mengganti", "vi": "Thần tượng {0}, hạng {1}. Nhấn để đổi", "th": "คนโปรด {0} ระดับ {1} กดเพื่อเปลี่ยน", "pt": "Favorito {0}, nível {1}. Toque para mudar", "fr": "Favori {0}, niveau {1}. Appuyez pour changer", "ru": "Кумир {0}, уровень {1}. Нажмите, чтобы изменить" },
} as const satisfies Record<string, TranslatedMessage>;
