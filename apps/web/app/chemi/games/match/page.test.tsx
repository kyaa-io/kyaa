import { afterEach, expect, it, vi } from "vitest";
import { getMatchPhotos } from "./photos";
import MatchPage from "./page";
import { MatchScreen } from "./screen";
import { FanAppFrame } from "@/components/fan-shell/fan-app-shell";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("./screen", () => ({ MatchScreen: () => null }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({
  FanAppFrame: () => null,
  FanContentContainer: () => null,
}));
vi.mock("./photos", { spy: true });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const params = { searchParams: Promise.resolve({ locale: "ko" }) };

it("keeps the game hidden when 케미 is disabled", async () => {
  vi.stubEnv("CHEMI_TAB", undefined);
  expect(getMatchPhotos()).toBeNull();
  await expect(MatchPage(params)).rejects.toThrow("NOT_FOUND");
});

it("opens the game with same-origin photos in a production build", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  vi.stubEnv("NODE_ENV", "production");
  const page = await MatchPage(params);
  expect(page.type).toBe(MatchScreen);
  const { changha, elina, yuna } = page.props.photos;
  expect([changha.cards.length, elina.cards.length, yuna.cards.length]).toEqual([9, 9, 7]);
  for (const src of [...changha.cards, ...elina.cards, ...yuna.cards]) expect(src).toMatch(/^\/chemi\/match\/cards\/[a-z]+-\d{2}\.webp$/);
});

it("shows the localized ready state when photos are unavailable", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  vi.mocked(getMatchPhotos).mockReturnValueOnce(null);
  const page = await MatchPage(params);
  expect(page.type).toBe(FanAppFrame);
  const ko = (await import("@/features/chemi/i18n/locales/ko/chemi.json")).default;
  expect(page.props.children.props.children.map((child: { props: { children: string } }) => child.props.children))
    .toEqual([ko.home.pair, ko.home.ready]);
});
