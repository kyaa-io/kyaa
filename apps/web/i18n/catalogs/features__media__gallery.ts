import type { TranslatedMessage } from "../messages";

export const messages = {
  "gallery": {
    "ja": "ギャラリー",
    "zh-Hans": "图库",
    "zh-Hant": "圖庫",
    "es": "Galería",
    "id": "Galeri",
    "vi": "Thư viện",
    "th": "แกลเลอรี",
    "pt": "Galeria",
    "fr": "Galerie",
    "ru": "Галерея"
  },
  "viewAll": {
    "ja": "すべて見る",
    "zh-Hans": "查看全部",
    "zh-Hant": "查看全部",
    "es": "Ver todo",
    "id": "Lihat semua",
    "vi": "Xem tất cả",
    "th": "ดูทั้งหมด",
    "pt": "Ver tudo",
    "fr": "Tout voir",
    "ru": "Смотреть все"
  },
  "noPosts": {
    "ja": "まだ投稿がありません",
    "zh-Hans": "还没有帖子",
    "zh-Hant": "還沒有貼文",
    "es": "Aún no hay publicaciones",
    "id": "Belum ada postingan",
    "vi": "Chưa có bài viết",
    "th": "ยังไม่มีโพสต์",
    "pt": "Ainda não há publicações",
    "fr": "Aucune publication pour le moment",
    "ru": "Публикаций пока нет"
  }
} as const satisfies Record<string, TranslatedMessage>;
