import type { TranslatedMessage } from "../messages";

export const messages = {
  "tierJourneyTitle": {
    "ja": "私と{0}",
    "zh-Hans": "我和{0}",
    "zh-Hant": "我和{0}",
    "es": "Tú y {0}",
    "id": "Kamu dan {0}",
    "vi": "Bạn và {0}",
    "th": "คุณกับ {0}",
    "pt": "Você e {0}",
    "fr": "Vous et {0}",
    "ru": "Вы и {0}"
  },
  "tierNow": {
    "ja": "現在 {0}",
    "zh-Hans": "目前 {0}",
    "zh-Hant": "目前 {0}",
    "es": "Ahora {0}",
    "id": "Sekarang {0}",
    "vi": "Hiện tại {0}",
    "th": "ตอนนี้ {0}",
    "pt": "Agora {0}",
    "fr": "Actuellement {0}",
    "ru": "Сейчас {0}"
  },
  "tierToNext": {
    "ja": "{0}まで{1}点",
    "zh-Hans": "距{0}还差{1}分",
    "zh-Hant": "距{0}還差{1}分",
    "es": "{1} pts para {0}",
    "id": "{1} poin lagi ke {0}",
    "vi": "Còn {1} điểm đến {0}",
    "th": "อีก {1} คะแนนถึง {0}",
    "pt": "{1} pts para {0}",
    "fr": "{1} pts avant {0}",
    "ru": "До {0}: {1} б."
  },
  "pagePrev": {
    "ja": "前のページ",
    "zh-Hans": "上一页",
    "zh-Hant": "上一頁",
    "es": "Página anterior",
    "id": "Halaman sebelumnya",
    "vi": "Trang trước",
    "th": "หน้าก่อนหน้า",
    "pt": "Página anterior",
    "fr": "Page précédente",
    "ru": "Предыдущая страница"
  },
  "pageNext": {
    "ja": "次のページ",
    "zh-Hans": "下一页",
    "zh-Hant": "下一頁",
    "es": "Página siguiente",
    "id": "Halaman berikutnya",
    "vi": "Trang sau",
    "th": "หน้าถัดไป",
    "pt": "Próxima página",
    "fr": "Page suivante",
    "ru": "Следующая страница"
  },
  "quizPassedHelper": {
    "ja": "最初のスタンプがパスポートに押されました。",
    "zh-Hans": "第一枚印章已盖在护照上。",
    "zh-Hant": "第一枚印章已蓋在護照上。",
    "es": "Tu primer sello ya está en tu pasaporte.",
    "id": "Stempel pertamamu sudah ada di paspor.",
    "vi": "Con dấu đầu tiên đã có trong hộ chiếu của bạn.",
    "th": "ตราประทับแรกอยู่ในพาสปอร์ตของคุณแล้ว",
    "pt": "Seu primeiro carimbo já está no passaporte.",
    "fr": "Votre premier tampon est dans votre passeport.",
    "ru": "Первый штамп уже в вашем паспорте."
  }
} satisfies Record<string, TranslatedMessage>;
