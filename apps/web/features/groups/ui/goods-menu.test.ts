import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { groupBenefitsCopy } from "./group-benefits-copy";

it.each(APP_LOCALES)("keeps the approved goods label in %s", locale => {
  const title = groupBenefitsCopy(locale, true).title;
  expect(title).toBeTruthy();
  expect(title === "굿즈").toBe(locale === "ko");
  expect(groupBenefitsCopy(locale).title).not.toBe(title);
});
