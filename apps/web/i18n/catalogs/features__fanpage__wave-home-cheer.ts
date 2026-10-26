import type { AppLocale } from "@/i18n/locales";

const rows: Record<AppLocale, readonly [string, string]> = {
  ko: ["응원하기", "WAVE 팬페이지 홈에서 응원 댓글을 남겨요."],
  en: ["Leave a cheer", "Leave a cheer on the WAVE fan page home."],
  ja: ["応援する", "WAVEファンページのホームに応援コメントを残しましょう。"],
  "zh-Hans": ["留言应援", "在WAVE粉丝主页留言应援。"],
  "zh-Hant": ["留言應援", "在WAVE粉絲首頁留言應援。"],
  es: ["Deja tu apoyo", "Deja un mensaje de apoyo en el inicio de la página de fans de WAVE."],
  id: ["Beri dukungan", "Tulis komentar dukungan di beranda halaman penggemar WAVE."],
  vi: ["Gửi lời cổ vũ", "Để lại lời cổ vũ trên trang chủ của trang người hâm mộ WAVE."],
  th: ["ส่งกำลังใจ", "ส่งข้อความเชียร์ที่หน้าแรกของแฟนเพจ WAVE"],
  pt: ["Deixe seu apoio", "Deixe uma mensagem de apoio no início da página de fãs do WAVE."],
  fr: ["Encourager", "Laissez un encouragement sur l’accueil de la page des fans de WAVE."],
  ru: ["Оставьте приветствие", "Оставьте свой комментарий на главной странице фан-страницы WAVE ."],

};

export function waveHomeCheerCopy(locale: AppLocale) {
  const [title, description] = rows[locale];
  return { title, description };
}
