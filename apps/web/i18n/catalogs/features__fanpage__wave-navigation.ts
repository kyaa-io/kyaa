import type { AppLocale } from "@/i18n/locales";
const labels = {
  ko: ["홈", "자기소개", "친구", "Live 방송", "Live Insight", "사진 · 영상", "응모"],
  en: ["Home", "Introductions", "Friends", "Live broadcasts", "Live Insight", "Photos · Videos", "Prize draws"],
  ja: ["ホーム", "自己紹介", "友だち", "ライブ配信", "Live Insight", "写真・動画", "応募"],
  "zh-Hans": ["首页", "自我介绍", "好友", "直播", "Live Insight", "照片 · 视频", "抽奖"],
  "zh-Hant": ["首頁", "自我介紹", "好友", "直播", "Live Insight", "照片 · 影片", "抽獎"],
  es: ["Inicio", "Presentaciones", "Amigos", "Emisiones en directo", "Live Insight", "Fotos · Vídeos", "Sorteos"],
  id: ["Beranda", "Perkenalan", "Teman", "Siaran langsung", "Live Insight", "Foto · Video", "Undian"],
  vi: ["Trang chủ", "Giới thiệu", "Bạn bè", "Phát trực tiếp", "Live Insight", "Ảnh · Video", "Bốc thăm"],
  th: ["หน้าแรก", "แนะนำตัว", "เพื่อน", "ถ่ายทอดสด", "Live Insight", "ภาพ · วิดีโอ", "จับรางวัล"],
  pt: ["Início", "Apresentações", "Amigos", "Transmissões ao vivo", "Live Insight", "Fotos · Vídeos", "Sorteios"],
  fr: ["Accueil", "Présentations", "Amis", "Diffusions en direct", "Live Insight", "Photos · Vidéos", "Tirages au sort"],
  ru: ["Главная", "О себе", "Друзья", "Прямые трансляции", "Live Insight", "Фотографии · Видео", "Розыгрыши призов"],

} satisfies Record<AppLocale, readonly [string, string, string, string, string, string, string]>;
const emptyFriends: Record<AppLocale, string> = {
  ko: "아직 연결된 친구가 없어요.", en: "You haven't connected with any friends yet.", ja: "まだつながった友だちはいません。", "zh-Hans": "还没有已添加的好友。", "zh-Hant": "還沒有已加入的好友。", es: "Aún no tienes amigos conectados.", id: "Belum ada teman yang terhubung.", vi: "Bạn chưa kết nối với người bạn nào.", th: "คุณยังไม่ได้เชื่อมต่อกับเพื่อน", pt: "Você ainda não se conectou com amigos.", fr: "Vous n’avez pas encore d’amis connectés.",
  ru: "Вы ещё не связались ни с одним из своих друзей.",

};
export function waveNavigationCopy(locale: AppLocale) { return { labels: labels[locale], emptyFriends: emptyFriends[locale] }; }
