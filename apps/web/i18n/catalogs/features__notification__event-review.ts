import type { TranslatedMessage } from "../messages";

export const messages = {
  "approvedTitle": {
    "ja": "「{name}」が承認されました",
    "zh-Hans": "“{name}”已通过审核",
    "zh-Hant": "「{name}」已通過審核",
    "es": "\"{name}\" fue aprobado",
    "id": "\"{name}\" disetujui",
    "vi": "\"{name}\" đã được duyệt",
    "th": "\"{name}\" ได้รับการอนุมัติแล้ว",
    "pt": "\"{name}\" foi aprovado",
    "fr": "« {name} » a été approuvé",
    "ru": "«{name}» одобрено"
  },
  "approvedDetail": {
    "ja": "カレンダーとイベント一覧に表示されます。",
    "zh-Hans": "现在会显示在日历和活动列表中。",
    "zh-Hant": "現在會顯示在行事曆和活動列表中。",
    "es": "Ya aparece en el calendario y en la lista de eventos.",
    "id": "Kini tampil di kalender dan daftar acara.",
    "vi": "Sự kiện đã hiển thị trên lịch và danh sách sự kiện.",
    "th": "ตอนนี้แสดงในปฏิทินและรายการกิจกรรมแล้ว",
    "pt": "Agora aparece no calendário e na lista de eventos.",
    "fr": "Il apparaît maintenant dans le calendrier et la liste des événements.",
    "ru": "Теперь оно есть в календаре и списке мероприятий."
  },
  "rejectedTitle": {
    "ja": "「{name}」は承認されませんでした",
    "zh-Hans": "“{name}”未通过审核",
    "zh-Hant": "「{name}」未通過審核",
    "es": "\"{name}\" no fue aprobado",
    "id": "\"{name}\" tidak disetujui",
    "vi": "\"{name}\" chưa được duyệt",
    "th": "\"{name}\" ไม่ได้รับการอนุมัติ",
    "pt": "\"{name}\" não foi aprovado",
    "fr": "« {name} » n’a pas été approuvé",
    "ru": "«{name}» не одобрено"
  },
  "rejectedDetail": {
    "ja": "イベント画面で理由を確認してください。",
    "zh-Hans": "请在活动页面查看原因。",
    "zh-Hant": "請在活動頁面查看原因。",
    "es": "Consulta el motivo en la página del evento.",
    "id": "Lihat alasannya di halaman acara.",
    "vi": "Xem lý do trên trang sự kiện.",
    "th": "ดูเหตุผลได้ที่หน้ากิจกรรม",
    "pt": "Veja o motivo na página do evento.",
    "fr": "Consultez le motif sur la page de l’événement.",
    "ru": "Причину можно посмотреть на странице мероприятия."
  }
} as const satisfies Record<string, TranslatedMessage>;
