import type { AppLocale } from "@/i18n/locales";

/** EMAIL-UI-1116: the mail row's stop reason in Settings > Notifications, and the three switches the web did not have. */
type EmailSettingsCopy = {
  blocked: { soft_paused: string; bounced: string; complained: string };
  socialNotifications: string;
  friendActivityNotifications: string;
  participationNotifications: string;
};

const copy: Partial<Record<AppLocale, EmailSettingsCopy>> & { en: EmailSettingsCopy } = {
  ko: {
    blocked: { soft_paused: "메일이 닿지 않아 잠시 멈췄어요", bounced: "메일이 되돌아와 멈췄어요", complained: "스팸 신고로 멈췄어요" },
    // A/B 확인 전 임시 이름. 앞 둘은 기존 화면(MY '친구와 메시지', 알림 종류 이름) 표기를 따랐다.
    socialNotifications: "친구와 메시지",
    friendActivityNotifications: "친구 활동",
    participationNotifications: "스탬프와 참여 마감",
  },
  en: {
    blocked: { soft_paused: "Paused: emails aren't arriving", bounced: "Stopped: emails bounced", complained: "Stopped: marked as spam" },
    socialNotifications: "Friends and messages",
    friendActivityNotifications: "Friend activity",
    participationNotifications: "Stamps and mission deadlines",
  },
};

export const emailSettingsCopy = (locale: AppLocale): EmailSettingsCopy => copy[locale] ?? copy.en;

/** The site notice made when mail stops (kind email_delivery_blocked). The address is the masked label stored on the notice. */
export function emailBlockedNoticeText(state: unknown, label: string | null, locale: "ko" | "en") {
  const ko = locale === "ko";
  const to = label ?? (ko ? "메일 주소" : "your address");
  if (state === "complained") return { title: ko ? "메일 보내기를 멈췄어요" : "We stopped sending email", detail: ko ? `${to}에서 스팸으로 신고돼 메일을 멈췄어요.` : `${to} reported our email as spam, so we stopped sending.` };
  if (state === "soft_paused") return { title: ko ? "메일 보내기를 잠시 멈췄어요" : "Email is paused for now", detail: ko ? `${to}로 보낸 메일이 여러 번 닿지 않았어요.` : `Several emails to ${to} didn't arrive.` };
  return { title: ko ? "메일이 되돌아왔어요" : "Your email bounced", detail: ko ? `${to}로 보낸 메일이 되돌아와 보내기를 멈췄어요.` : `Email to ${to} bounced, so we stopped sending.` };
}
