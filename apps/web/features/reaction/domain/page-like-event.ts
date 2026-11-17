/**
 * 팬페이지 좋아요 이벤트 창(2026-11-16 ~ 11-23, 하루는 KST 00:00~23:59). `to`는 다음 00:00(미포함).
 * 관리자 참여자 집계(`features/admin/event-participants.ts`)와 팬페이지의 이벤트 좋아요 카드가 이 한 정의를 같이 읽는다.
 */
export const pageLikeEventWindows = {
  "elina-onboarding-1117": { key: "elina-onboarding-1117", slug: "elina", from: "2026-11-17T00:00:00+09:00", to: "2026-11-18T00:00:00+09:00" },
  "changha-onboarding-1118": { key: "changha-onboarding-1118", slug: "changha", from: "2026-11-18T00:00:00+09:00", to: "2026-11-19T00:00:00+09:00" },
  "yuna-onboarding-1119": { key: "yuna-onboarding-1119", slug: "yuna", from: "2026-11-19T00:00:00+09:00", to: "2026-11-20T00:00:00+09:00" },
  "changha-photo-1122": { key: "changha-photo-1122", slug: "changha", from: "2026-11-22T00:00:00+09:00", to: "2026-11-24T00:00:00+09:00" },
} as const;

/** 엘리나 패스포트 이벤트(11/20~21). 관리자 집계의 `passport-issued` 창이고, 홈 배너 순서만 이 정의를 함께 읽는다. */
export const passportIssuedEventWindows = {
  "elina-passport-1120": { key: "elina-passport-1120", slug: "elina", from: "2026-11-20T00:00:00+09:00", to: "2026-11-22T00:00:00+09:00" },
} as const;

export type PageLikeEventWindow = (typeof pageLikeEventWindows)[keyof typeof pageLikeEventWindows];

/** 이벤트 이름: 배너 제목과 같은 `이름 × Kyaa`. 한국어 말고는 영문 이름을 쓴다. */
const eventNames: Readonly<Record<string, { ko: string; en: string }>> = {
  elina: { ko: "엘리나", en: "Elina" },
  changha: { ko: "창하", en: "Changha" },
  yuna: { ko: "유나", en: "Yuna" },
};

/** 지금(`now`) 이 크리에이터의 좋아요 이벤트 창이 열려 있으면 그 창, 아니면 undefined. */
export function openPageLikeEvent(slug: string, now: Date | number): PageLikeEventWindow | undefined {
  const at = typeof now === "number" ? now : now.getTime();
  return Object.values(pageLikeEventWindows).find((window) => window.slug === slug && Date.parse(window.from) <= at && at < Date.parse(window.to));
}

export function pageLikeEventTitle(slug: string, locale: string): string | undefined {
  const name = eventNames[slug];
  return name ? `${locale === "ko" ? name.ko : name.en} × Kyaa` : undefined;
}
