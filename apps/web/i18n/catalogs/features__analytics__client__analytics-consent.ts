import type { TranslatedMessage } from "../messages";

/** GA4 consent bar. Legal wording is not final: only the policy link carries legal weight (user decision pending). */
export const messages = {
  "analyticsConsentQuestion": {
    "ja": "訪問統計にGoogleアナリティクスを使ってもよいですか？",
    "zh-Hans": "可以使用 Google Analytics 统计访问数据吗？",
    "zh-Hant": "可以使用 Google Analytics 統計造訪資料嗎？",
    "es": "¿Podemos usar Google Analytics para las estadísticas de visitas?",
    "id": "Boleh kami pakai Google Analytics untuk statistik kunjungan?",
    "vi": "Chúng tôi dùng Google Analytics để thống kê lượt truy cập được không?",
    "th": "ใช้ Google Analytics เพื่อสถิติการเข้าชมได้ไหม",
    "pt": "Podemos usar o Google Analytics para estatísticas de visitas?",
    "fr": "Pouvons-nous utiliser Google Analytics pour les statistiques de visite ?",
    "ru": "Можно использовать Google Analytics для статистики посещений?"
  },
  "analyticsConsentPolicy": {
    "ja": "プライバシーポリシー",
    "zh-Hans": "隐私政策",
    "zh-Hant": "隱私權政策",
    "es": "Privacidad",
    "id": "Kebijakan Privasi",
    "vi": "Quyền riêng tư",
    "th": "นโยบายความเป็นส่วนตัว",
    "pt": "Privacidade",
    "fr": "Confidentialité",
    "ru": "Конфиденциальность"
  },
  "analyticsConsentDecline": {
    "ja": "拒否",
    "zh-Hans": "拒绝",
    "zh-Hant": "拒絕",
    "es": "Rechazar",
    "id": "Tolak",
    "vi": "Từ chối",
    "th": "ปฏิเสธ",
    "pt": "Recusar",
    "fr": "Refuser",
    "ru": "Отклонить"
  },
  "analyticsConsentAllow": {
    "ja": "許可",
    "zh-Hans": "允许",
    "zh-Hant": "允許",
    "es": "Permitir",
    "id": "Izinkan",
    "vi": "Cho phép",
    "th": "อนุญาต",
    "pt": "Permitir",
    "fr": "Autoriser",
    "ru": "Разрешить"
  },
  "analyticsConsentSettings": {
    "ja": "訪問統計の設定",
    "zh-Hans": "访问统计设置",
    "zh-Hant": "造訪統計設定",
    "es": "Estadísticas de visitas",
    "id": "Pengaturan statistik kunjungan",
    "vi": "Cài đặt thống kê truy cập",
    "th": "ตั้งค่าสถิติการเข้าชม",
    "pt": "Estatísticas de visitas",
    "fr": "Statistiques de visite",
    "ru": "Статистика посещений"
  },
  "analyticsConsentRegion": {
    "ja": "訪問統計の同意",
    "zh-Hans": "访问统计同意",
    "zh-Hant": "造訪統計同意",
    "es": "Consentimiento de estadísticas",
    "id": "Persetujuan statistik kunjungan",
    "vi": "Đồng ý thống kê truy cập",
    "th": "ความยินยอมสถิติการเข้าชม",
    "pt": "Consentimento de estatísticas",
    "fr": "Consentement aux statistiques",
    "ru": "Согласие на статистику"
  },
} satisfies Record<string, TranslatedMessage>;

export const analyticsConsentSource = {
  question: { ko: "방문 통계에 Google 애널리틱스를 써도 될까요?", en: "Can we use Google Analytics for visit statistics?", key: "analyticsConsentQuestion" },
  policy: { ko: "개인정보처리방침", en: "Privacy Policy", key: "analyticsConsentPolicy" },
  decline: { ko: "거부", en: "Decline", key: "analyticsConsentDecline" },
  allow: { ko: "허용", en: "Allow", key: "analyticsConsentAllow" },
  settings: { ko: "방문 통계 설정", en: "Visit statistics settings", key: "analyticsConsentSettings" },
  region: { ko: "방문 통계 동의", en: "Visit statistics consent", key: "analyticsConsentRegion" },
} as const;
