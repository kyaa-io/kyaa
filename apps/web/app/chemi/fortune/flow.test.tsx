import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { FortuneFlow } from "./flow";
import { todayKst } from "./reading";

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

const stored = (patch: object = {}) => ({
  ...reading,
  content: "fortune",
  kind: "daily",
  kstDate: todayKst(),
  ...patch,
});

function restoreFetch(detail: () => Response) {
  return vi.fn(async (path: string) =>
    path.startsWith("/api/chemi/readings/")
      ? detail()
      : Response.json({ participation: null }),
  );
}

it("opens the result straight from a restored talk address without history entries", async () => {
  window.history.replaceState(null, "", "/chemi/fortune?step=talk-2&c=changha&r=reading");
  vi.stubGlobal("fetch", restoreFetch(() => Response.json(stored())));
  const go = vi.spyOn(window.history, "go");
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "건너뛰기" }));
  await waitFor(() => expect(window.location.search).toContain("step=result"));
  expect(go).not.toHaveBeenCalled();
  go.mockRestore();
});

it("sends a restored reading from another day or another content back to the entrance", async () => {
  for (const patch of [{ kstDate: "2020-01-01" }, { content: "saju" }, { kind: "first" }]) {
    window.history.replaceState(null, "", "/chemi/fortune?step=talk-1&c=changha&r=reading");
    vi.stubGlobal("fetch", restoreFetch(() => Response.json(stored(patch))));
    const { unmount } = render(<FortuneFlow locale="ko" />);
    await waitFor(() => expect(showFanToast).toHaveBeenCalled());
    expect(window.location.search).not.toContain("step=");
    expect(screen.getByRole("button", { name: "응, 봐 줘" })).toBeVisible();
    unmount();
    vi.clearAllMocks();
  }
});

it("sends a restored reading without result fields back to the entrance", async () => {
  window.history.replaceState(null, "", "/chemi/fortune?step=talk-1&c=changha&r=reading");
  vi.stubGlobal("fetch", restoreFetch(() => Response.json(stored({ result: { locked: false, score: 1 } }))));
  render(<FortuneFlow locale="ko" />);
  await waitFor(() => expect(showFanToast).toHaveBeenCalled());
  expect(window.location.search).not.toContain("step=");
});

it("tells an expired login apart from a service refusal", async () => {
  const request = (status: number, code: string) =>
    vi.fn(async (path: string) =>
      path === "/api/chemi/readings"
        ? Response.json({ error: { code } }, { status })
        : Response.json({ participation: null }),
    );
  vi.stubGlobal("fetch", request(401, "UNAUTHORIZED"));
  const first = render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("로그인이 만료되었습니다.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(login).toHaveBeenCalled();
  first.unmount();

  vi.stubGlobal("fetch", request(503, "CHEMI_UNAVAILABLE"));
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("운세를 불러오지 못했습니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
});

it("ignores a calculation that finishes after the member went back", async () => {
  let finish: (response: Response) => void = () => {};
  const request = vi.fn((path: string) =>
    path === "/api/chemi/readings"
      ? new Promise<Response>((resolve) => (finish = resolve))
      : Promise.resolve(Response.json({ participation: null })),
  );
  vi.stubGlobal("fetch", request);
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  await waitFor(() => expect(window.location.search).toContain("step=calc"));
  window.history.replaceState(null, "", "/chemi/fortune?c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  finish(Response.json(reading));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(window.location.search).not.toContain("step=");
  expect(screen.getByRole("button", { name: "응, 봐 줘" })).toBeVisible();
});
