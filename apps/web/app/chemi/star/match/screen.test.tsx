import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ko from "@/features/chemi/i18n/locales/ko/chemi.json";
import { matchCopy } from "./copy";
import { matchWays, MatchScreen } from "./screen";

const token = vi.hoisted(() => async () => "session");
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, login: vi.fn(), user: { id: "member" }, getAccessToken: token }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("counts soft aspects per planet and hard aspects as friction", () => {
  expect(
    matchWays([
      { mine: "Venus", theirs: "Sun", angle: 120 },
      { mine: "Sun", theirs: "Venus", angle: 60 },
      { mine: "Moon", theirs: "Sun", angle: 90 },
      { mine: "Mercury", theirs: "Mars", angle: 180 },
    ]),
  ).toEqual([2, 0, 0, 2]);
});

it("has every label in all twelve languages", () => {
  for (const locale of ["ko", "en", "es", "fr", "id", "ja", "pt", "ru", "th", "vi", "zh-Hans", "zh-Hant"] as const) {
    const copy = matchCopy(locale);
    expect([...copy.domains, ...copy.strengths, copy.aspects, copy.fourWays, copy.who, copy.freeToday].every(Boolean)).toBe(true);
    expect(copy.seeWith("A")).toContain("A");
    expect(Object.keys(copy.planets)).toEqual(["Sun", "Moon", "Mercury", "Venus", "Mars"]);
  }
});

it("picks a saved partner, shows four meters and the closest aspects, and explains the daily limit", async () => {
  let limit = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/chemi/profile")
        return Response.json({ birth: { birthDate: "1995-05-05" }, partners: [{ id: "p1", nickname: "민지", birthDate: "1997-03-12" }, { id: "p2", nickname: "동생", birthDate: "2001-11-03" }] });
      if (limit) return Response.json({ error: { code: "CHEMI_PAYMENT_REQUIRED" } }, { status: 402 });
      return Response.json({ result: { connections: [{ mine: "Moon", theirs: "Sun", angle: 120, error: 1 }, { mine: "Sun", theirs: "Mars", angle: 90, error: 2 }, { mine: "Sun", theirs: "Jupiter", angle: 0, error: 3 }] } });
    }),
  );
  render(<MatchScreen locale="ko" character="changha" birthCopy={ko.myBirth as never} />);
  fireEvent.click(await screen.findByRole("button", { name: "민지와 보기" }));
  expect(await screen.findByRole("heading", { level: 1, name: "나 × 민지" })).toBeVisible();
  expect(screen.getByRole("img", { name: "편안함 3/5" })).toBeVisible();
  expect(screen.getByRole("img", { name: "끌림 2/5" })).toBeVisible();
  expect(screen.getByText("나 달 × 민지 해")).toBeVisible();
  expect(screen.queryByText(/Jupiter/)).toBeNull();
  limit = true;
  fireEvent.click(screen.getByRole("button", { name: "다른 사람과" }));
  fireEvent.click(await screen.findByRole("button", { name: /동생/ }));
  fireEvent.click(screen.getByRole("button", { name: "동생와 보기" }));
  expect(await screen.findByText("오늘 무료 궁합은 다 봤어요. 내일 다시 볼 수 있어요.")).toBeVisible();
});
