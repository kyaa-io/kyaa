// ko/en live here; the other locales are in i18n/catalogs/features__notification__event-review.ts.
export const eventReviewSource = {
  approvedTitle: { ko: "'{name}' 행사가 승인됐어요", en: "\"{name}\" was approved" },
  approvedDetail: { ko: "이제 캘린더와 행사 목록에 보여요.", en: "It now shows in the calendar and event list." },
  rejectedTitle: { ko: "'{name}' 행사가 반려됐어요", en: "\"{name}\" was not approved" },
  rejectedDetail: { ko: "행사 화면에서 반려 사유를 확인해 주세요.", en: "See the reason on the event page." },
} as const;
