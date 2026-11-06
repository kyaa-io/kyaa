import type { TranslatedMessage } from "../messages";

export const messages = {
  "enter": {
    "ja": "入室する",
    "zh-Hans": "进入",
    "zh-Hant": "進入",
    "es": "Entrar",
    "id": "Masuk",
    "vi": "Vào phòng",
    "th": "เข้าห้อง",
    "pt": "Entrar",
    "fr": "Entrer",
    "ru": "Войти"
  },
  "otherRooms": {
    "ja": "ほかの部屋",
    "zh-Hans": "其他房间",
    "zh-Hant": "其他房間",
    "es": "Otras salas",
    "id": "Ruang lain",
    "vi": "Phòng khác",
    "th": "ห้องอื่น",
    "pt": "Outras salas",
    "fr": "Autres salons",
    "ru": "Другие комнаты"
  },
  "viewConditions": {
    "ja": "条件を見る",
    "zh-Hans": "查看条件",
    "zh-Hant": "查看條件",
    "es": "Ver requisitos",
    "id": "Lihat syarat",
    "vi": "Xem điều kiện",
    "th": "ดูเงื่อนไข",
    "pt": "Ver requisitos",
    "fr": "Voir les conditions",
    "ru": "Посмотреть условия"
  },
  "joinedFans": {
    "ja": "参加したファン",
    "zh-Hans": "已加入的粉丝",
    "zh-Hant": "已加入的粉絲",
    "es": "Fans que se unieron",
    "id": "Penggemar yang bergabung",
    "vi": "Fan đã tham gia",
    "th": "แฟนที่เข้าร่วมแล้ว",
    "pt": "Fãs que entraram",
    "fr": "Fans inscrits",
    "ru": "Вступившие фанаты"
  }
} as const satisfies Record<string, TranslatedMessage>;
