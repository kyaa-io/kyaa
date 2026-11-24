import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: () => null, FanContentContainer: () => null }));
import MyBirthPage from "./page";

const original = { tab: process.env.CHEMI_TAB, app: process.env.APP_ENV };
beforeEach(() => { delete process.env.CHEMI_TAB; delete process.env.APP_ENV; });
afterEach(() => {
  for (const [key, value] of [["CHEMI_TAB", original.tab], ["APP_ENV", original.app]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

const screenOf = (page: Awaited<ReturnType<typeof MyBirthPage>>) => (page.props as { children: { props: { children: { props: Record<string, unknown> } } } }).children.props.children.props;

it("answers 404 while CHEMI_TAB is not exactly true", async () => {
  for (const value of [undefined, "false", "TRUE"]) {
    if (value === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = value;
    await expect(MyBirthPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  }
});

it("shows the page in the chosen language and the partner card and star line on production too", async () => {
  process.env.CHEMI_TAB = "true";
  process.env.APP_ENV = "prod";
  const launch = screenOf(await MyBirthPage({ searchParams: Promise.resolve({ locale: "ja" }) }));
  expect((launch.copy as Record<string, string>).title).toBe("誕生日情報");
  expect(launch.launch).toBe(false);
  expect((launch.uses as { id: string }[]).map((use) => use.id)).toEqual(["saju", "fortune", "star"]);
});

it("adds the star horoscope and the partner card on dev", async () => {
  process.env.CHEMI_TAB = "true";
  process.env.APP_ENV = "dev";
  const dev = screenOf(await MyBirthPage({ searchParams: Promise.resolve({}) }));
  expect(dev.launch).toBe(false);
  expect((dev.uses as { id: string }[]).map((use) => use.id)).toEqual(["saju", "fortune", "star"]);
});
