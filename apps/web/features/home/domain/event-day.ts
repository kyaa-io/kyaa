import type { AppLocale } from "@/i18n/locales";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** 지금부터 오늘 자정(KST, 다음 날 00:00)까지 남은 분. 올림이라 자정 직전에도 1분 이상이고, 자정이 지나면 24시간으로 다시 시작한다. */
export function minutesUntilKstMidnight(now: Date | number): number {
  const at = typeof now === "number" ? now : now.getTime();
  const nextMidnight = Math.floor((at + KST_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - KST_OFFSET_MS;
  return Math.ceil((nextMidnight - at) / MINUTE_MS);
}

type EventDayCopy = { label: string; hour: string; minute: string; join: string; left: (time: string) => string; close: string };

const copy: Record<AppLocale, EventDayCopy> = {
  ko: { label: "오늘 하루 이벤트", hour: "시간", minute: "분", join: " ", left: (time) => `${time} 남음`, close: "닫기" },
  en: { label: "One-day event today", hour: "h", minute: "m", join: " ", left: (time) => `${time} left`, close: "Close" },
  ja: { label: "今日だけのイベント", hour: "時間", minute: "分", join: "", left: (time) => `残り${time}`, close: "閉じる" },
  "zh-Hans": { label: "今日限定活动", hour: "小时", minute: "分钟", join: "", left: (time) => `剩余${time}`, close: "关闭" },
  "zh-Hant": { label: "今日限定活動", hour: "小時", minute: "分鐘", join: "", left: (time) => `剩餘${time}`, close: "關閉" },
  es: { label: "Evento solo hoy", hour: " h", minute: " min", join: " ", left: (time) => `Quedan ${time}`, close: "Cerrar" },
  id: { label: "Acara khusus hari ini", hour: " jam", minute: " mnt", join: " ", left: (time) => `Sisa ${time}`, close: "Tutup" },
  vi: { label: "Sự kiện chỉ hôm nay", hour: " giờ", minute: " phút", join: " ", left: (time) => `Còn ${time}`, close: "Đóng" },
  th: { label: "กิจกรรมวันนี้วันเดียว", hour: " ชม.", minute: " นาที", join: " ", left: (time) => `เหลือ ${time}`, close: "ปิด" },
  pt: { label: "Evento só hoje", hour: " h", minute: " min", join: " ", left: (time) => `Restam ${time}`, close: "Fechar" },
  fr: { label: "Événement aujourd’hui seulement", hour: " h", minute: " min", join: " ", left: (time) => `Il reste ${time}`, close: "Fermer" },
  ru: { label: "Событие только сегодня", hour: " ч", minute: " мин", join: " ", left: (time) => `Осталось ${time}`, close: "Закрыть" },
};

/** '오늘 하루 이벤트' 태그 글자. */
export const eventDayLabel = (locale: AppLocale): string => copy[locale].label;
/** 띠의 닫기 버튼 이름. */
export const eventDayCloseLabel = (locale: AppLocale): string => copy[locale].close;

/** `10시간 36분 남음`. 1시간 미만이면 분만(`36분 남음`), 정각이면 시간만(`10시간 남음`). */
export function eventDayRemainingText(locale: AppLocale, now: Date | number): string {
  const { hour, minute, join, left } = copy[locale];
  const total = minutesUntilKstMidnight(now);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts = [hours > 0 ? `${hours}${hour}` : null, hours === 0 || minutes > 0 ? `${minutes}${minute}` : null].filter((part): part is string => part !== null);
  return left(parts.join(join));
}

/** 홈 상단 이벤트 띠를 닫은 배너 id를 기억하는 쿠키. 서버가 읽어 닫은 사람 화면에는 띠를 아예 그리지 않는다. */
export const EVENT_STRIP_COOKIE = "kyaa_event_strip_closed";

export function eventStripClosedCookie(bannerId: string): string {
  return `${EVENT_STRIP_COOKIE}=${bannerId}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
}

const liveEventLabels: Record<AppLocale, string> = {
  ko: "이벤트 중",
  en: "LIVE EVENT",
  ja: "イベント開催中",
  "zh-Hans": "活动进行中",
  "zh-Hant": "活動進行中",
  es: "Evento activo",
  id: "Acara berlangsung",
  vi: "Đang diễn ra",
  th: "กำลังจัดกิจกรรม",
  pt: "Evento ativo",
  fr: "Événement en cours",
  ru: "Событие идёт",
};

export const liveEventLabel = (locale: AppLocale): string => liveEventLabels[locale];
