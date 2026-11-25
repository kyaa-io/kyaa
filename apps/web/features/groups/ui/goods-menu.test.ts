import { expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { groupBenefitsCopy } from "./group-benefits-copy";

vi.mock("@/features/groups/goods-menu", () => ({ GOODS_MENU: true }));

it.each(APP_LOCALES)("keeps the approved goods label in %s", locale => {
  expect(groupBenefitsCopy(locale).title).toBe("굿즈");
});
