import { expect, it } from "vitest";
import { messages } from "@/i18n/catalogs/features__notification__event-review";
import { APP_LOCALES } from "@/i18n/locales";
import { eventReviewText } from "./event-review-copy";
import { eventReviewSource } from "./event-review-source";

it("fills every locale and puts the event's name in each title", () => {
  expect(Object.keys(messages).sort()).toEqual(Object.keys(eventReviewSource).sort());
  for (const locale of APP_LOCALES) for (const decision of ["approved", "rejected"] as const) {
    const said = eventReviewText(locale, { decision, name: "RUN$&" });
    expect(said.title, `${locale} ${decision}`).toContain("RUN$&");
    expect(said.title).not.toContain("{name}");
    expect(said.detail.trim(), `${locale} ${decision}`).toBeTruthy();
  }
  expect(eventReviewText("ko", { decision: "rejected", name: "한강" }).title).toBe("'한강' 행사가 반려됐어요");
});
