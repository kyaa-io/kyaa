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
  kstDate: todayKst(),
  styled: null,
  replayed: false,
  reward: { points: 3 },
  result: {
    locked: false,
    score: 82,
    grade: { name: "좋은 날" },
    fields: { fandom: 91, people: 88, money: 71, rest: 80, work: 85, love: 78 },
    periods: { morning: 84, afternoon: 72, night: 88 },
    evidence: {
      dayPillar: "을미",
      yearPillar: "병오",
      relation: "무관",
      stage: "쇠",
      spirit: "화개살",
      tenGod: "식신",
      useful: "목",
      timeBasis: "시주 포함",
    },
    luck: {
      color: "초록",
      number: 3,
      direction: "동",
      item: "나무 연필",
      luckyHour: { start: 9, end: 11 },
      restHour: null,
    },
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

const failWith = (status: number, code: string) =>
  vi.fn(async (path: string) =>
    path === "/api/chemi/readings"
      ? Response.json({ error: { code } }, { status })
      : Response.json({ participation: null }),
  );

it("does not ask a closed account to log in again", async () => {
  vi.stubGlobal("fetch", failWith(403, "CHEMI_ACCOUNT_CLOSED"));
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("운세를 불러오지 못했습니다.")).toBeVisible();
  expect(screen.queryByText("로그인이 만료되었습니다.")).toBeNull();
});

it("still treats a forbidden login token as an expired login", async () => {
  vi.stubGlobal("fetch", failWith(403, "VERIFIED_EMAIL_REQUIRED"));
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("로그인이 만료되었습니다.")).toBeVisible();
});

it("shows a failure instead of crashing when a new reading has no lucky data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/chemi/readings"
        ? Response.json({ ...reading, result: { ...reading.result, luck: null } })
        : Response.json({ participation: null }),
    ),
  );
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("운세를 불러오지 못했습니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
});

it("rejects a new reading whose display or detail field has the wrong type", async () => {
  const wrong = [
    { luck: { ...reading.result.luck, color: { name: "초록" } } },
    { luck: { ...reading.result.luck, number: "3" } },
    { luck: { ...reading.result.luck, restHour: { start: "a", end: 1 } } },
    { evidence: { ...reading.result.evidence, yearPillar: { cycle: 1 } } },
    { evidence: { ...reading.result.evidence, useful: undefined } },
  ];
  for (const patch of wrong) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) =>
        path === "/api/chemi/readings"
          ? Response.json({ ...reading, result: { ...reading.result, ...patch } })
          : Response.json({ participation: null }),
      ),
    );
    const { unmount } = render(<FortuneFlow locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
    expect(await screen.findByText("운세를 불러오지 못했습니다.")).toBeVisible();
    unmount();
    window.history.replaceState(null, "", "/chemi/fortune");
  }
});

it("rejects a reading whose headline or reward fields are not text and numbers", async () => {
  for (const patch of [{ styled: { headline: { a: 1 } } }, { reward: { exp: { a: 1 } } }]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) =>
        path === "/api/chemi/readings"
          ? Response.json({ ...reading, ...patch })
          : Response.json({ participation: null }),
      ),
    );
    const { unmount } = render(<FortuneFlow locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
    expect(await screen.findByText("운세를 불러오지 못했습니다.")).toBeVisible();
    unmount();
    window.history.replaceState(null, "", "/chemi/fortune");
  }
});

it("sends a restored reading without lucky data back to the entrance", async () => {
  window.history.replaceState(null, "", "/chemi/fortune?step=talk-4&c=changha&r=reading");
  vi.stubGlobal(
    "fetch",
    restoreFetch(() => Response.json(stored({ result: { ...reading.result, luck: null } }))),
  );
  render(<FortuneFlow locale="ko" />);
  await waitFor(() => expect(showFanToast).toHaveBeenCalled());
  expect(window.location.search).not.toContain("step=");
  expect(screen.getByRole("button", { name: "응, 봐 줘" })).toBeVisible();
});

it("shows the saved date of a new reading, not the time it was drawn", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/chemi/readings"
        ? Response.json({ ...reading, kstDate: "2030-01-02" })
        : Response.json({ participation: null }),
    ),
  );
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("2030.01.02", {}, { timeout: 3000 })).toBeVisible();
});

it("rejects a new reading that has no saved date", async () => {
  const { kstDate: _omit, ...undated } = reading;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/chemi/readings"
        ? Response.json(undated)
        : Response.json({ participation: null }),
    ),
  );
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("운세를 불러오지 못했습니다.")).toBeVisible();
});

it("resumes the calculation when the member goes back and then forward during it", async () => {
  const request = vi.fn(async (path: string) =>
    path === "/api/chemi/readings"
      ? Response.json(reading)
      : Response.json({ participation: null }),
  );
  vi.stubGlobal("fetch", request);
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  await waitFor(() => expect(window.location.search).toContain("step=calc"));
  window.history.replaceState(null, "", "/chemi/fortune?c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.history.replaceState({ fortuneDepth: 1 }, "", "/chemi/fortune?step=calc&c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(await screen.findByText("좋다, 더 말해 줘", {}, { timeout: 4000 })).toBeVisible();
  expect(window.location.search).toContain("step=talk-1");
  expect(request.mock.calls.filter(([path]) => path === "/api/chemi/readings").length).toBeGreaterThanOrEqual(2);
});

it("does not turn a new calculation for another character into the earlier result when going back and forward", async () => {
  let second: (response: Response) => void = () => {};
  let calls = 0;
  const request = vi.fn((path: string) => {
    if (path !== "/api/chemi/readings") return Promise.resolve(Response.json({ participation: null }));
    calls += 1;
    return calls === 1
      ? Promise.resolve(Response.json(reading))
      : new Promise<Response>((resolve) => (second = resolve));
  });
  vi.stubGlobal("fetch", request);
  window.history.replaceState(null, "", "/chemi/fortune?c=changha");
  render(<FortuneFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("좋다, 더 말해 줘", {}, { timeout: 3000 })).toBeVisible();
  // 다른 최애로 바꿔 새 계산을 시작한다. 응답은 아직 오지 않았다.
  window.history.replaceState(null, "", "/chemi/fortune?c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  fireEvent.click((await screen.findAllByRole("button", { name: "다음 최애" }))[0]);
  const other = new URLSearchParams(window.location.search).get("c");
  expect(other).not.toBe("changha");
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  await waitFor(() => expect(window.location.search).toContain("step=calc"));
  const calcUrl = window.location.search;
  // 응답 전에 뒤로 갔다가 앞으로 간다.
  window.history.replaceState(null, "", `/chemi/fortune?c=${other}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.history.replaceState({ fortuneDepth: 1 }, "", `/chemi/fortune${calcUrl}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await waitFor(() => expect(calls).toBe(3));
  expect(window.location.search).not.toContain("r=reading&step=talk");
  expect(new URLSearchParams(window.location.search).get("c")).toBe(other);
  second(Response.json({ ...reading, readingId: "other-reading" }));
  await waitFor(() => expect(window.location.search).toContain("r=other-reading"), { timeout: 4000 });
});

it("shows a loading shape, not the entrance, while a restored address loads", async () => {
  window.history.replaceState(null, "", "/chemi/fortune?step=talk-2&c=changha&r=reading");
  let finish: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) =>
      path.startsWith("/api/chemi/readings/")
        ? new Promise<Response>((resolve) => (finish = resolve))
        : Promise.resolve(Response.json({ participation: null })),
    ),
  );
  render(<FortuneFlow locale="ko" restoring />);
  expect(screen.queryByRole("button", { name: "응, 봐 줘" })).toBeNull();
  await waitFor(() => expect(finish).not.toBe(undefined));
  await waitFor(() => finish(Response.json(stored())));
  expect(await screen.findByText("덕질은 어때?")).toBeVisible();
  expect(screen.queryByRole("button", { name: "응, 봐 줘" })).toBeNull();
});
