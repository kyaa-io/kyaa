import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FortuneFlow } from "./flow";

const { session, login, getAccessToken } = vi.hoisted(() => ({
  session: { authenticated: true },
  login: vi.fn(),
  getAccessToken: vi.fn(async () => "session"),
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({
    ready: true,
    authenticated: session.authenticated,
    login,
    user: { id: "member" },
    getAccessToken,
  }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: vi.fn() }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({
  celebrateReward: vi.fn(),
}));

const reading = {
  readingId: "reading",
  styled: null,
  replayed: false,
  reward: { points: 3 },
  result: {
    locked: false,
    score: 82,
    grade: { name: "좋은 날" },
    fields: { fandom: 91, people: 88, money: 71, rest: 80, work: 85, love: 78 },
    periods: { morning: 84, afternoon: 72, night: 88 },
    evidence: { dayPillar: "을미", stage: "쇠", spirit: "화개살" },
    luck: { color: "초록", number: 3, direction: "동", luckyHour: { start: 9, end: 11 } },
  },
};

beforeEach(() => window.history.replaceState(null, "", "/chemi/fortune"));
afterEach(() => {
  session.authenticated = true;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("asks guests to log in instead of requesting a reading", async () => {
  session.authenticated = false;
  const request = vi.fn(async () => Response.json({ participation: null }));
  vi.stubGlobal("fetch", request);
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("운세를 보려면 로그인해 주세요.")).toBeVisible();
  expect(request.mock.calls.flat()).not.toContain("/api/chemi/readings");
});

it("saves the reading once, then walks the four talk steps", async () => {
  const request = vi.fn(async (path: string) =>
    path === "/api/chemi/readings"
      ? Response.json(reading)
      : Response.json({ participation: { period: "today", count: 128 } }),
  );
  vi.stubGlobal("fetch", request);
  render(<FortuneFlow locale="ko" />);
  expect(await screen.findByText("오늘 128명이 봤어요")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("좋다, 더 말해 줘", {}, { timeout: 3000 })).toBeVisible();
  expect(window.location.search).toContain("step=talk-1");
  expect(window.location.search).toContain("r=reading");
  expect(request.mock.calls.filter(([path]) => path === "/api/chemi/readings")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "좋다, 더 말해 줘" }));
  expect(await screen.findByText("덕질은 어때?")).toBeVisible();
  expect(window.location.search).toContain("step=talk-2");
});

it("opens the birth sheet when the profile has no birth yet", async () => {
  const request = vi.fn(async (path: string) =>
    path === "/api/chemi/readings"
      ? Response.json({ error: { code: "CHEMI_BIRTH_REQUIRED" } }, { status: 409 })
      : Response.json({ participation: null }),
  );
  vi.stubGlobal("fetch", request);
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "생일 정보" })).toBeVisible());
  expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
});
