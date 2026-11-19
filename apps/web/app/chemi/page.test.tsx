import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: () => null, FanContentContainer: () => null }));
import ChemiPage from "./page";

const original = process.env.CHEMI_TAB;
beforeEach(() => { delete process.env.CHEMI_TAB; });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });

it("answers 404 when CHEMI_TAB is unset, false or not exactly true", async () => {
  for (const value of [undefined, "false", "1", "TRUE"]) {
    if (value === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = value;
    await expect(ChemiPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  }
});
it("draws the empty tab frame with the requested locale when CHEMI_TAB is true", async () => {
  process.env.CHEMI_TAB = "true";
  const page = await ChemiPage({ searchParams: Promise.resolve({ locale: "ja" }) });
  expect(page.props).toMatchObject({ locale: "ja", currentPath: "/chemi" });
});

it("closes direct result and shared-result entries before reading a share", async () => {
  const { default: FortunePage } = await import("./fortune/page");
  for (const params of [{}, {from:"sample"}]) {
    await expect(FortunePage({searchParams: Promise.resolve(params)})).rejects.toThrow("NOT_FOUND");
  }
});
