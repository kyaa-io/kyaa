import { messages } from "@/i18n/catalogs/features__notification__event-review";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { eventReviewSource } from "./event-review-source";

export type EventReview = { decision: "approved" | "rejected"; name: string };

/** The result and the event's name, from what the review stored. Replacing with a function keeps `$` in a name literal. */
export function eventReviewText(locale: AppLocale, review: EventReview) {
  const pick = (key: keyof typeof eventReviewSource) => translate(locale, messages[key], locale === "ko" ? eventReviewSource[key].ko : eventReviewSource[key].en);
  const prefix = review.decision === "approved" ? "approved" : "rejected";
  return { title: pick(`${prefix}Title`).replace("{name}", () => review.name), detail: pick(`${prefix}Detail`) };
}
