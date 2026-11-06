import { messages } from "@/i18n/catalogs/features__dukjil-guide__ui__guide-copy";
import { messages as detailMessages } from "@/i18n/catalogs/features__dukjil-guide__ui__guide-detail";
import { translate } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/locales";
import type { GuideActivity, GuideActivityKey } from "../domain/guide-model";
import { dukjilGuideSource } from "./guide-source";
import { dukjilGuideDetailSource } from "./guide-detail-source";

export type GuideCopyKey = keyof typeof dukjilGuideSource;

/** ko/en come from guide-source.ts, the other locales from the i18n catalog; numbers are always passed in by the caller. */
export function guideText(locale: AppLocale, key: GuideCopyKey, values: readonly unknown[] = []) {
  const source = dukjilGuideSource[key];
  return translate(locale, messages[key], locale === "ko" ? source.ko : source.en, values);
}

export type GuideDetailKey = keyof typeof dukjilGuideDetailSource;

/** Copy added for the 2026-11-07 guide detail layout (hero lead, key figures, exchange, closing). */
export function guideDetailText(locale: AppLocale, key: GuideDetailKey, values: readonly unknown[] = []) {
  const source = dukjilGuideDetailSource[key];
  return translate(locale, detailMessages[key], locale === "ko" ? source.ko : source.en, values);
}

const ACTIVITY_LABEL: Record<GuideActivityKey, GuideCopyKey> = {
  checkin: "dkgActCheckin", post: "dkgActPost", comment: "dkgActComment", reaction: "dkgActReaction", share: "dkgActShare",
  invite: "dkgActInvite", quiz: "dkgActQuiz", subscription: "dkgActSubscription", live_reserve: "dkgActLiveReserve",
  live_attend: "dkgActLiveAttend", survey: "dkgActSurvey", mission: "dkgActMission", event_checkin: "dkgActEventCheckin",
  event_review: "dkgActEventReview", proof: "dkgActProof",
};

export function activityLabel(locale: AppLocale, key: GuideActivityKey) {
  return guideText(locale, ACTIVITY_LABEL[key]);
}

export function pointsText(locale: AppLocale, a: GuideActivity) {
  if (a.points === null) return a.firstPoints === null ? "" : guideText(locale, "dkgPointsFirst", [a.firstPoints]);
  if (a.pointsMax !== null) return guideText(locale, "dkgPointsRange", [a.points, a.pointsMax]);
  return guideText(locale, "dkgPointsOne", [a.points]);
}

export function limitText(locale: AppLocale, a: GuideActivity) {
  if (!a.limit) return "";
  const key = a.limit.per === "day" ? "dkgLimitDay" : a.limit.per === "month" ? "dkgLimitMonth" : "dkgLimitCreatorMonth";
  return guideText(locale, key, [a.limit.max]);
}
