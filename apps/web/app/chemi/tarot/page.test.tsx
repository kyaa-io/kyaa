import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: () => null, FanContentContainer: () => null }));
import TarotPage from "./page";

const original = process.env.CHEMI_TAB;
beforeEach(() => { delete process.env.CHEMI_TAB; });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });

it("answers 404 unless CHEMI_TAB is exactly true", async () => {
  for (const value of [undefined, "false", "1"]) {
    if (value === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = value;
    await expect(TarotPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  }
});

it("opens the entry scene with a known favorite and step, and falls back otherwise", async () => {
  process.env.CHEMI_TAB = "true";
  const open = async (params: Record<string, string>) => {
    const page = await TarotPage({ searchParams: Promise.resolve(params) });
    return (page.props.children.props.children as { props: Record<string, unknown> }).props;
  };
  expect(await open({ c: "yuna", step: "pick" })).toMatchObject({ initialCharacter: "yuna", initialStep: "pick" });
  expect(await open({ c: "nobody", step: "x" })).toMatchObject({ initialCharacter: "changha", initialStep: "enter" });
});
