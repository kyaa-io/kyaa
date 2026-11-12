import type { AppLocale } from "@/i18n/locales";
type Copy = { title: string; invite: string; join: string; close: string };
export const jjinfanBannerCopy: Record<AppLocale, Copy> = {
  ko: { title: "찐팬 100 챌린지", invite: "찐팬 100 챌린지를 하고 있어요. 같이 동참해봐요!", join: "동참하기", close: "닫기" },
  en: { title: "100 True Fans Challenge", invite: "The 100 True Fans Challenge is on. Join in!", join: "Join in", close: "Close" },
  ja: { title: "真のファン100人チャレンジ", invite: "真のファン100人チャレンジ開催中。一緒に参加しましょう！", join: "参加する", close: "閉じる" },
  "zh-Hans": { title: "100位真爱粉挑战", invite: "100位真爱粉挑战进行中，一起来参与吧！", join: "参与挑战", close: "关闭" },
  "zh-Hant": { title: "100位真愛粉挑戰", invite: "100位真愛粉挑戰進行中，一起來參與吧！", join: "參與挑戰", close: "關閉" },
  es: { title: "Reto de 100 fans de verdad", invite: "¡El reto de 100 fans de verdad está en marcha! ¡Participa!", join: "Participar", close: "Cerrar" },
  id: { title: "Tantangan 100 Fan Sejati", invite: "Tantangan 100 Fan Sejati sedang berlangsung. Ayo ikut!", join: "Ikut serta", close: "Tutup" },
  vi: { title: "Thử thách 100 fan đích thực", invite: "Thử thách 100 fan đích thực đang diễn ra. Cùng tham gia nhé!", join: "Tham gia", close: "Đóng" },
  th: { title: "ชาเลนจ์ 100 แฟนตัวจริง", invite: "ชาเลนจ์ 100 แฟนตัวจริงกำลังจัดอยู่ มาร่วมกันเลย!", join: "เข้าร่วม", close: "ปิด" },
  pt: { title: "Desafio dos 100 fãs de verdade", invite: "O desafio dos 100 fãs de verdade está a acontecer. Participe!", join: "Participar", close: "Fechar" },
  fr: { title: "Défi des 100 vrais fans", invite: "Le défi des 100 vrais fans est lancé. Participez !", join: "Participer", close: "Fermer" },
  ru: { title: "Челлендж «100 настоящих фанатов»", invite: "Челлендж «100 настоящих фанатов» уже идёт. Присоединяйтесь!", join: "Присоединиться", close: "Закрыть" },
};
