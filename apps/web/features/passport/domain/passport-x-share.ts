import type { AppLocale } from "@/i18n/locales";

/** The official X account every shared post mentions, and the hashtags after the link (no leading #). */
export const X_SHARE_MENTION = "@kyaa_app";
export const X_SHARE_HASHTAGS = ["kyaa"] as const;

/** The link a post carries: the shared Passport landing, marked as a member share posted on X. */
export function passportShareUrl(origin: string, token: string, locale: AppLocale) {
  return `${origin}/s/${token}?${new URLSearchParams({ locale, utm_source: "share", utm_medium: "referral", utm_campaign: "passport-share", utm_content: "passport_x" })}`;
}

export function passportShareText(locale: AppLocale, creatorName: string) {
  return locale === "ko" ? `${creatorName} 팬 패스포트를 받았어요 ${X_SHARE_MENTION}` : `I got my ${creatorName} Fan Passport ${X_SHARE_MENTION}`;
}

/** X's post composer with the text, link and hashtags filled in. A Web Intent takes no picture: the link's preview card shows the Passport. */
export function xPostIntentUrl(input: { text: string; url: string; hashtags?: readonly string[] }) {
  const query = new URLSearchParams({ text: input.text, url: input.url });
  if (input.hashtags?.length) query.set("hashtags", input.hashtags.join(","));
  return `https://x.com/intent/tweet?${query}`;
}
