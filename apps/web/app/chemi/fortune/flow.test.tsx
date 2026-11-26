import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { FortuneFlow } from "./flow";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import en from "@/features/chemi/i18n/locales/en/chemi.json";
import { todayKst } from "./reading";
import { fortuneChoiceLabel } from "./lines";
import ko from "@/features/chemi/i18n/locales/ko/chemi.json";

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
  const entryCount = window.history.length;
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("도와줄 사람도 있어?", {}, { timeout: 3000 })).toBeVisible();
  expect(window.location.search).toContain("step=talk-1");
  expect(window.location.search).toContain("r=reading");
  expect(request.mock.calls.filter(([path]) => path === "/api/chemi/readings")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "도와줄 사람도 있어?" }));
  expect(await screen.findByText("친구도 만날까?")).toBeVisible();
  expect(window.location.search).toContain("step=talk-2");
  expect(window.history.length).toBe(entryCount);
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

it.each([
  { stage: ["쇠"] },
  { spirit: ["화개살"] },
])("returns to the entrance when a stored reading has invalid evidence %j", async (patch) => {
  window.history.replaceState(null, "", "/chemi/fortune?step=talk-1&c=changha&r=reading");
  const result = { ...reading.result, evidence: { ...reading.result.evidence, ...patch } };
  vi.stubGlobal("fetch", restoreFetch(() => Response.json(stored({ result }))));
  render(<FortuneFlow locale="ko" />);
  await waitFor(() => expect(showFanToast).toHaveBeenCalledWith({
    title: "오늘의 운세 결과가 아니라 처음 화면으로 돌아왔어요.",
  }));
  expect(await screen.findByRole("button", { name: "응, 봐 줘" })).toBeVisible();
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
    { evidence: { ...reading.result.evidence, stage: ["쇠"] } },
    { evidence: { ...reading.result.evidence, spirit: ["화개살"] } },
    { evidence: { ...reading.result.evidence, spirit: { toString: "화개살" } } },
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
  expect(await screen.findByText("도와줄 사람도 있어?", {}, { timeout: 4000 })).toBeVisible();
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
  expect(await screen.findByText("도와줄 사람도 있어?", {}, { timeout: 3000 })).toBeVisible();
  // 다른 최애로 바꿔 새 계산을 시작한다. 응답은 아직 오지 않았다.
  window.history.replaceState(null, "", "/chemi/fortune?c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  fireEvent.click(await screen.findByRole("button", { name: "엘리나" }));
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
  expect(await screen.findByText("친구도 만날까?")).toBeVisible();
  expect(screen.queryByRole("button", { name: "응, 봐 줘" })).toBeNull();
});

it("calls the signed-in fan by nickname in the first line (DF-FORT-008)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/me/profile"
        ? Response.json({ profile: { nickname: "별빛토끼" } })
        : Response.json({ participation: null }),
    ),
  );
  render(<FortuneFlow locale="ko" />);
  expect(await screen.findByText("별빛토끼, 구름 위까지 올라왔네? 오늘 운세 내가 봐 줄게, 기대해.")).toBeVisible();
});

it("keeps the shared first line when the fan has no nickname", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/me/profile" ? Response.json({ profile: { nickname: null } }) : Response.json({ participation: null }),
    ),
  );
  render(<FortuneFlow locale="ko" />);
  expect(await screen.findByText("구름 위까지 올라왔네? 오늘 운세 내가 봐 줄게, 기대해.")).toBeVisible();
});

it("writes the result body in the chosen favorite's voice (DF-FORT-001)", async () => {
  const body = async (character: string) => {
    window.history.replaceState(null, "", `/chemi/fortune?step=result&c=${character}&r=reading`);
    vi.stubGlobal("fetch", restoreFetch(() => Response.json(stored())));
    const { unmount, container } = render(<FortuneFlow locale="ko" />);
    await screen.findByText("오늘의 흐름", {}, { timeout: 3000 });
    const flow = [...container.querySelectorAll("section")].find((node) => node.textContent?.startsWith("오늘의 흐름"));
    const text = flow?.querySelector("p")?.textContent ?? "";
    unmount();
    return text;
  };
  const lines = [await body("changha"), await body("elina"), await body("yuna"), await body("dosa")];
  expect(new Set(lines).size).toBe(4);
  expect(lines[3]).toContain("이오.");
  for (const line of lines) expect(line).not.toMatch(/일진|일간|식신/);
});

it("asks the same follow-up in other languages instead of the fixed three buttons (CHEMI-FORTUNE-CHOICE-CONTEXT-1126)", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => (path === "/api/chemi/readings" ? Response.json(reading) : Response.json({}))));
  render(
    <ReadingCopyProvider value={en}>
      <FortuneFlow locale="en" />
    </ReadingCopyProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: en.readingUi.readFortune }));
  // 좋은 날·사람 88: 1/4 '도와줄 사람', 2/4 '윗사람' 뒤 '친구도'·'부탁은 언제'.
  fireEvent.click(await screen.findByRole("button", { name: "Who will help me?" }, { timeout: 3000 }));
  expect(await screen.findByRole("button", { name: "Meet a fan friend too?" })).toBeVisible();
  expect(screen.getByRole("button", { name: "When should I ask?" })).toBeVisible();
  expect(screen.queryByText(en.readingUi.whatFandom)).toBeNull();
});

it("starts page four with the item after a 챙길 것 choice and with the hour after a 언제 choice (CHEMI-FORTUNE-TALK4-1126)", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => (path === "/api/chemi/readings" ? Response.json(reading) : Response.json({}))));
  const input = {
    score: reading.result.score, grade: reading.result.grade.name, fandom: reading.result.fields.fandom,
    money: reading.result.fields.money, people: reading.result.fields.people,
    luckyHour: reading.result.luck.luckyHour, color: reading.result.luck.color,
  };
  const press = async (talk: 1 | 2 | 3, slot: "next" | "skip") =>
    fireEvent.click(await screen.findByRole("button", { name: fortuneChoiceLabel("changha", talk, slot, input)! }, { timeout: 3000 }));
  for (const route of ["bring", "when"] as const) {
    window.history.replaceState(null, "", "/chemi/fortune");
    const view = render(<FortuneFlow locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: ko.readingUi.readFortune }));
    await press(1, "next");
    if (route === "bring") {
      await press(2, "next");
      await press(3, "next");
      expect(await screen.findByText(new RegExp(`^${input.color}색 물건 하나 챙겨\\.`))).toBeVisible();
    } else {
      await press(2, "skip");
      expect(await screen.findByText(/^부탁할 거 있으면 \d+시에서 \d+시 사이에 해\./)).toBeVisible();
    }
    view.unmount();
  }
});
