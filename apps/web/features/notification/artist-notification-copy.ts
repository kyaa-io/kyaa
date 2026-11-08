import type { AppLocale } from "@/i18n/locales";

/** 261107-2 E6: the two artist notice switches in Settings > Notifications. */
export const artistNotificationSettingCopy: Record<AppLocale, { artistActivityNotifications: string; artistOnlineNotifications: string }> = {
  ko: { artistActivityNotifications: "아티스트 댓글", artistOnlineNotifications: "아티스트 접속" },
  en: { artistActivityNotifications: "Artist comments", artistOnlineNotifications: "Artist on the fan page" },
  ja: { artistActivityNotifications: "アーティストのコメント", artistOnlineNotifications: "アーティストの入室" },
  "zh-Hans": { artistActivityNotifications: "艺人评论", artistOnlineNotifications: "艺人上线" },
  "zh-Hant": { artistActivityNotifications: "藝人留言", artistOnlineNotifications: "藝人上線" },
  es: { artistActivityNotifications: "Comentarios del artista", artistOnlineNotifications: "Artista en la página de fans" },
  id: { artistActivityNotifications: "Komentar artis", artistOnlineNotifications: "Artis di halaman penggemar" },
  vi: { artistActivityNotifications: "Bình luận của nghệ sĩ", artistOnlineNotifications: "Nghệ sĩ vào trang người hâm mộ" },
  th: { artistActivityNotifications: "ความคิดเห็นของศิลปิน", artistOnlineNotifications: "ศิลปินเข้าหน้าแฟน" },
  pt: { artistActivityNotifications: "Comentários do artista", artistOnlineNotifications: "Artista na página de fãs" },
  fr: { artistActivityNotifications: "Commentaires de l’artiste", artistOnlineNotifications: "Artiste sur la page des fans" },
  ru: { artistActivityNotifications: "Комментарии артиста", artistOnlineNotifications: "Артист на фан-странице" },
};
