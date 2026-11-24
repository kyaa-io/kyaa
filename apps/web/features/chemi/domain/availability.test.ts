import { afterEach, expect, it, vi } from "vitest";
import { chemiFeatures, chemiPreview, chemiWeeklyRankingsEnabled } from "./availability";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

it("enables weekly rankings by default under production without opening previews", () => {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("CHEMI_WEEKLY_RANKINGS", undefined);
  expect(chemiWeeklyRankingsEnabled()).toBe(true);
  expect(chemiPreview()).toBe(false);
  expect(chemiFeatures()).toEqual({ ask: false, reminders: false });
});

it.each(["production", "dev"])("can disable the entry rankings under %s", (environment) => {
  vi.stubEnv("APP_ENV", environment);
  vi.stubEnv("CHEMI_WEEKLY_RANKINGS", "false");
  expect(chemiWeeklyRankingsEnabled()).toBe(false);
});
