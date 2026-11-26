import { expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { groupBenefitsCopy } from "./group-benefits-copy";

it.each(APP_LOCALES)("keeps the approved goods label in %s", locale => {
  expect(groupBenefitsCopy(locale, true).title).toBe("굿즈");
  expect(groupBenefitsCopy(locale).title).not.toBe("굿즈");
});
