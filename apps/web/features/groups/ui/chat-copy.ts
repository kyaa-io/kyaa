import type { AppLocale } from "@/i18n/locales";

/** 팬페이지 '채팅방(임시운영)'(대표 11/19 20:35). 탭 이름, 크리에이터 표시, 입장 알림, 입장 조건, 전송 제한, 랭킹의 접속 표시. */
const keys = ["title", "creator", "entered", "open", "verifiedOnly", "loginOnly", "rateLimited", "online"] as const;
const values: Record<AppLocale, readonly [string, string, string, string, string, string, string, string]> = {
  ko: ["채팅방(임시운영)", "크리에이터", "{name} 입장 중", "채팅방 가기", "팬인증한 팬만 들어올 수 있습니다.", "로그인하면 들어올 수 있습니다.", "잠시 후 다시 보내 주세요.", "접속 중"],
  en: ["Chat (beta)", "Creator", "{name} is here now", "Open chat", "Only verified fans can join.", "Log in to join.", "Please wait a moment before sending again.", "Online"],
  ja: ["チャット(試験運用)", "クリエイター", "{name}が入場中", "チャットへ", "ファン認証をしたファンだけが参加できます。", "ログインすると参加できます。", "少し待ってから送信してください。", "接続中"],
  "zh-Hans": ["聊天室(试运行)", "创作者", "{name} 正在页面中", "去聊天", "仅限已认证粉丝加入。", "登录后即可加入。", "请稍后再发送。", "在线"],
  "zh-Hant": ["聊天室(試營運)", "創作者", "{name} 正在頁面中", "去聊天", "僅限已認證粉絲加入。", "登入後即可加入。", "請稍後再傳送。", "在線"],
  es: ["Chat (beta)", "Creador", "{name} está aquí", "Abrir chat", "Solo pueden entrar fans verificados.", "Inicia sesión para entrar.", "Espera un momento antes de volver a enviar.", "En línea"],
  id: ["Obrolan (beta)", "Kreator", "{name} sedang di sini", "Buka obrolan", "Hanya penggemar terverifikasi yang bisa masuk.", "Masuk untuk bergabung.", "Tunggu sebentar sebelum mengirim lagi.", "Online"],
  vi: ["Phòng chat (thử nghiệm)", "Nhà sáng tạo", "{name} đang ở đây", "Mở chat", "Chỉ fan đã xác minh mới vào được.", "Đăng nhập để tham gia.", "Vui lòng đợi một chút rồi gửi lại.", "Trực tuyến"],
  th: ["แชต (ทดลอง)", "ครีเอเตอร์", "{name} อยู่ที่นี่", "เปิดแชต", "เฉพาะแฟนที่ยืนยันแล้วเท่านั้นที่เข้าได้", "เข้าสู่ระบบเพื่อเข้าร่วม", "โปรดรอสักครู่แล้วส่งอีกครั้ง", "ออนไลน์"],
  pt: ["Chat (beta)", "Criador", "{name} está aqui", "Abrir chat", "Só fãs verificados podem entrar.", "Entre para participar.", "Aguarde um momento antes de enviar de novo.", "Online"],
  fr: ["Chat (bêta)", "Créateur", "{name} est là", "Ouvrir le chat", "Réservé aux fans vérifiés.", "Connectez-vous pour participer.", "Patientez un instant avant de renvoyer.", "En ligne"],
  ru: ["Чат (бета)", "Автор", "{name} сейчас здесь", "Открыть чат", "Только для подтверждённых фанатов.", "Войдите, чтобы участвовать.", "Подождите немного и отправьте снова.", "Онлайн"],
};

export function chatCopy(locale: AppLocale) {
  return Object.fromEntries(keys.map((key, index) => [key, values[locale][index]])) as Record<(typeof keys)[number], string>;
}
