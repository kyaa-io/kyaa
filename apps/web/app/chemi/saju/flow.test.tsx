import { act, cleanup, fireEvent, render, waitFor, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import enCatalog from "@/features/chemi/i18n/locales/en/chemi.json";
import koCatalog from "@/features/chemi/i18n/locales/ko/chemi.json";
import type { Chart } from "./chart";
import { SajuFlow } from "./flow";

const { login, getAccessToken } = vi.hoisted(() => ({
  login: vi.fn(),
  getAccessToken: vi.fn(async () => "session"),
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, login, user: { id: "member" }, getAccessToken }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: vi.fn() }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: vi.fn() }));
vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnBadge: () => <b>+3</b> }));

const chart: Chart = {
  pillars: {
    year: { heavenlyStem: "무", earthlyBranch: "인" },
    month: { heavenlyStem: "을", earthlyBranch: "묘" },
    day: { heavenlyStem: "병", earthlyBranch: "오" },
    hour: null,
  },
  timeKnown: false,
  termBoundary: false,
  locked: [],
  lockReason: null,
  solarTerm: null,
};
const first = { readingId: "first-1", result: chart, replayed: true };
const compat = { dayStems: ["병", "계"], combinations: [], clashes: [] };
const pairReading = { readingId: "pair-1", result: compat, reward: { points: 3, exp: 20 } };
const partner = {
  id: "partner-1",
  nickname: "민지",
  birthDate: "1998-03-02",
  calendar: "solar",
  birthTime: null,
  timePrecision: "unknown",
  gender: null,
};

type Route = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;
/** 메서드와 경로로 응답을 고른다. 없는 경로는 404. */
function server(routes: Record<string, Route>) {
  const calls: { key: string; body: unknown }[] = [];
  const request = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[key] ?? Object.entries(routes).find(([name]) => key.startsWith(name.replace(/\*$/, "")) && name.endsWith("*"))?.[1];
    return route ? route(init, url) : new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", request);
  return { calls, count: (key: string) => calls.filter((call) => call.key === key).length };
}
const baseRoutes: Record<string, Route> = {
  "GET /api/chemi/readings": () => Response.json([{ readingId: "first-1", kind: "first", character: "changha" }]),
  "GET /api/chemi/readings/first-1": () => Response.json(first),
  "GET /api/chemi/rewards/today": () => new Response("{}", { status: 404 }),
  "GET /api/chemi/profile": () => Response.json({ birth: null, partners: [partner] }),
};

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(async () => {
  cleanup();
  // 시트를 닫으며 보낸 history.back 의 popstate 가 다음 시험에 섞이지 않게 비운다.
  await new Promise((resolve) => setTimeout(resolve, 50));
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openResult(url: string) {
  window.history.replaceState(null, "", url);
  const restoring = new URLSearchParams(window.location.search).get("step") === "result";
  render(<SajuFlow locale="ko" birthCopy={koCatalog.myBirth} restoring={restoring} />);
  return screen.findByRole("heading", { level: 1 });
}
async function startPairWithSaved() {
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  fireEvent.click(await screen.findByRole("button", { name: /민지/ }));
}

it("궁합 조회가 실패하면 결과 화면이 아니라 오류 화면이 보이고, 다시 시도는 궁합을 다시 요청한다", async () => {
  let attempts = 0;
  const api = server({
    ...baseRoutes,
    "POST /api/chemi/readings": () =>
      ++attempts === 1 ? Response.json({ error: { code: "CHEMI_UNAVAILABLE" } }, { status: 503 }) : Response.json(pairReading),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  await startPairWithSaved();
  expect(await screen.findByText("사주를 불러오지 못했습니다.", {}, { timeout: 3000 })).toBeVisible();
  expect(screen.queryByText("타고난 기운")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("나 × 민지", {}, { timeout: 4000 })).toBeVisible();
  expect(api.count("POST /api/chemi/readings")).toBe(2);
  expect(api.calls.filter((call) => call.key === "POST /api/chemi/readings").map((call) => call.body)).toEqual([
    { content: "saju", kind: "compat", character: "changha", partnerId: "partner-1" },
    { content: "saju", kind: "compat", character: "changha", partnerId: "partner-1" },
  ]);
});

it("궁합 오류 화면의 뒤로 가기는 보던 풀이로 돌아간다", async () => {
  server({
    ...baseRoutes,
    "POST /api/chemi/readings": () => Response.json({ error: { code: "CHEMI_UNAVAILABLE" } }, { status: 503 }),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  await startPairWithSaved();
  await screen.findByText("사주를 불러오지 못했습니다.", {}, { timeout: 3000 });
  fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
  expect(await screen.findByText("타고난 기운")).toBeVisible();
});

it("궁합 주소를 새 탭에서 열면 저장된 궁합 풀이와 상대를 되살린다", async () => {
  server({
    ...baseRoutes,
    "GET /api/chemi/readings/pair-1": () => Response.json(pairReading),
  });
  await openResult("/chemi/saju?step=result&view=pair&c=changha&r=first-1&p=pair-1&w=partner-1");
  expect(await screen.findByText("나 × 민지")).toBeVisible();
  expect(window.location.search).toContain("p=pair-1");
});

it("궁합 풀이 번호가 없거나 불러올 수 없으면 사주 풀이로 돌아간다", async () => {
  server({ ...baseRoutes, "GET /api/chemi/readings/pair-1": () => new Response("{}", { status: 404 }) });
  await openResult("/chemi/saju?step=result&view=pair&c=changha&r=first-1&p=pair-1&w=partner-1");
  expect(await screen.findByText("타고난 기운")).toBeVisible();
  expect(showFanToast).toHaveBeenCalledWith({ title: "저장된 궁합이 아니라 사주 풀이로 돌아왔어요." });
  expect(window.location.search).not.toContain("view=pair");
  expect(window.location.search).not.toMatch(/[?&]p=/);
});

it("뒤로·앞으로 가면 주소의 궁합 풀이 번호에 맞는 풀이를 보여 준다", async () => {
  server({
    ...baseRoutes,
    "POST /api/chemi/readings": () => Response.json(pairReading),
    "GET /api/chemi/readings/pair-1": () => Response.json(pairReading),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  await startPairWithSaved();
  expect(await screen.findByText("나 × 민지", {}, { timeout: 4000 })).toBeVisible();
  expect(window.location.search).toContain("p=pair-1");
  expect(window.location.search).toContain("w=partner-1");
  window.history.back();
  expect(await screen.findByText("타고난 기운")).toBeVisible();
  window.history.forward();
  expect(await screen.findByText("나 × 민지")).toBeVisible();
});

async function fillNewPartner() {
  const sheet = await screen.findByRole("dialog", { name: "궁합 상대 넣기" });
  fireEvent.change(within(sheet).getByLabelText("별명"), { target: { value: "하나" } });
  fireEvent.change(within(sheet).getByLabelText("생년월일"), { target: { value: "20000101" } });
  fireEvent.click(within(sheet).getByLabelText(/상대 정보를 저장해요/));
  fireEvent.click(within(sheet).getByRole("button", { name: "저장하고 궁합 보기" }));
}
const noPartners: Record<string, Route> = {
  ...baseRoutes,
  "GET /api/chemi/profile": () => Response.json({ birth: null, partners: [] }),
};

it("새 상대는 저장 동의에 체크해야 저장하고 궁합을 보며, 본 뒤에 지우지 않는다", async () => {
  const api = server({
    ...noPartners,
    "POST /api/chemi/partners": () => Response.json({ partnerId: "kept-1" }),
    "POST /api/chemi/readings": () => Response.json(pairReading),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  const sheet = await screen.findByRole("dialog", { name: "궁합 상대 넣기" });
  const save = within(sheet).getByRole("button", { name: "저장하고 궁합 보기" });
  fireEvent.change(within(sheet).getByLabelText("별명"), { target: { value: "하나" } });
  fireEvent.change(within(sheet).getByLabelText("생년월일"), { target: { value: "20000101" } });
  expect(save).toBeDisabled();
  expect(within(sheet).getByLabelText(/궁합 기록을 위해 상대 정보를 저장해요/)).not.toBeChecked();
  expect(api.count("POST /api/chemi/partners")).toBe(0);
  fireEvent.click(within(sheet).getByLabelText(/상대 정보를 저장해요/));
  expect(save).toBeEnabled();
  fireEvent.click(save);
  expect(await screen.findByText("나 × 하나", {}, { timeout: 4000 })).toBeVisible();
  expect(api.count("POST /api/chemi/partners")).toBe(1);
  expect(api.calls.find((call) => call.key === "POST /api/chemi/partners")?.body).toMatchObject({
    nickname: "하나",
    birthDate: "2000-01-01",
    timePrecision: "unknown",
    source: "saju",
  });
  expect(api.count("DELETE /api/chemi/partners")).toBe(0);
});

it("궁합 요청에 쓸 토큰을 15초 안에 받지 못하면 오류 화면이 보인다", async () => {
  server({ ...baseRoutes, "POST /api/chemi/readings": () => Response.json(pairReading) });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  const pick = await screen.findByRole("button", { name: /민지/ });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    // 상대 목록은 받았고, 궁합을 요청하기 직전 토큰 조회가 끝나지 않는다.
    getAccessToken.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(pick);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(screen.getByText("연결이 끊겼습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

it("궁합이 실패하면 장면이 보이도록 스크롤을 맨 위로 올린다", async () => {
  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  server({
    ...baseRoutes,
    "POST /api/chemi/readings": () => Response.json({ error: { code: "CHEMI_UNAVAILABLE" } }, { status: 503 }),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  await startPairWithSaved();
  await screen.findByText("사주를 불러오지 못했습니다.", {}, { timeout: 3000 });
  expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  // 오류 문구는 그림 위 맨 글자가 아니라 대화 상자 면 안에 있다.
  expect(screen.getByRole("alert").parentElement?.className).toMatch(/controls/);
});

it("상대 입력 시트에서 겹친 생년월일 휠·태어난 시간 판을 닫아도 입력 시트와 넣은 값이 남는다", async () => {
  server({ ...noPartners });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  const sheet = await screen.findByRole("dialog", { name: "궁합 상대 넣기" });
  fireEvent.change(within(sheet).getByLabelText("별명"), { target: { value: "하나" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "휠로 고르기" }));
  const wheel = await screen.findByRole("dialog", { name: "생년월일" });
  fireEvent.click(within(wheel).getByRole("button", { name: "선택 완료" }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(screen.queryByRole("dialog", { name: "생년월일" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "궁합 상대 넣기" })).toBeVisible();
  expect(within(screen.getByRole("dialog", { name: "궁합 상대 넣기" })).getByLabelText("별명")).toHaveValue("하나");
  fireEvent.click(within(screen.getByRole("dialog", { name: "궁합 상대 넣기" })).getByRole("button", { name: /^선택$/ }));
  const time = await screen.findByRole("dialog", { name: "태어난 시간" });
  fireEvent.click(within(time).getByRole("button", { name: "닫기" }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(screen.queryByRole("dialog", { name: "태어난 시간" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "궁합 상대 넣기" })).toBeVisible();
});

it("기록 이동으로 풀이를 다시 읽다 15초 안에 끝나지 않으면 오류 화면과 다시 시도가 보이고, 늦게 온 응답은 화면에 반영되지 않는다", async () => {
  let attempts = 0;
  let lateStart: (() => void) | null = null;
  const api = server({
    ...baseRoutes,
    "GET /api/chemi/readings/first-2": (init) => {
      attempts += 1;
      if (attempts > 1) return Response.json({ readingId: "first-2", result: chart, replayed: true });
      // 첫 시도는 끝나지 않는다. 중단 신호가 오면 끊긴다.
      return new Promise<Response>((_, reject) => {
        lateStart = () => reject(new DOMException("aborted", "AbortError"));
        init?.signal?.addEventListener("abort", lateStart, { once: true });
      });
    },
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  expect(await screen.findByText("타고난 기운")).toBeVisible();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    await act(async () => {
      window.history.pushState({}, "", "/chemi/saju?step=result&c=changha&r=first-2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("status")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(screen.getByText("연결이 끊겼습니다.")).toBeVisible();
    expect(screen.queryByText("타고난 기운")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
  } finally {
    vi.useRealTimers();
  }
  expect(await screen.findByText("타고난 기운")).toBeVisible();
  expect(api.count("GET /api/chemi/readings/first-2")).toBe(2);
  expect(screen.queryByText("연결이 끊겼습니다.")).toBeNull();
});

it("서로 다른 사주 기록 사이를 뒤로·앞으로 가면 그 주소의 풀이를 다시 읽는다", async () => {
  const second = { readingId: "first-2", result: chart, replayed: true };
  const api = server({
    ...baseRoutes,
    "GET /api/chemi/readings/first-2": () => Response.json(second),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  expect(await screen.findByText("타고난 기운")).toBeVisible();
  expect(api.count("GET /api/chemi/readings/first-2")).toBe(0);
  await act(async () => {
    window.history.pushState({}, "", "/chemi/saju?step=result&c=changha&r=first-2");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await vi.waitFor(() => expect(api.count("GET /api/chemi/readings/first-2")).toBe(1));
  expect(await screen.findByText("타고난 기운")).toBeVisible();
  await act(async () => {
    window.history.pushState({}, "", "/chemi/saju?step=result&c=changha&r=first-1");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await vi.waitFor(() => expect(api.calls.filter((c) => c.key === "GET /api/chemi/readings/first-1").length).toBeGreaterThanOrEqual(2));
});

it("새로 연 결과에서 선택 화면으로 돌아가면 결과 번호가 주소에서 사라진다", async () => {
  server(baseRoutes);
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
  expect(await screen.findByRole("heading", { name: "최애 사주" })).toBeVisible();
  expect(window.location.search).toBe("?c=changha");
});

it("shows the saved-reading action and greeting in English", async () => {
  server(baseRoutes);
  window.history.replaceState(null, "", "/chemi/saju?locale=en");
  render(
    <ReadingCopyProvider value={enCatalog}>
      <SajuFlow locale="en" birthCopy={koCatalog.myBirth} />
    </ReadingCopyProvider>
  );
  expect(await screen.findByRole("button", { name: "Past reading" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Ask a question" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Star Saju" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to Chemi" })).toBeVisible();
  expect(screen.getByText(enCatalog.readingUi.againChangha)).toBeVisible();
});

it("다시 온 장면의 주 버튼은 질문 주제 화면을 한 번에 열고, 지난 풀이는 기록 아이콘으로 연다", async () => {
  server(baseRoutes);
  window.history.replaceState(null, "", "/chemi/saju?c=changha");
  render(<SajuFlow locale="ko" birthCopy={koCatalog.myBirth} />);
  const before = window.history.length;
  fireEvent.click(await screen.findByRole("button", { name: "질문하기" }));
  const params = new URLSearchParams(window.location.search);
  expect(params.get("step")).toBe("result");
  expect(params.get("r")).toBe("first-1");
  expect(params.get("ask")).toBe("topic");
  // 기록은 한 칸만 쌓인다: 뒤로 가면 다시 온 장면이다.
  expect(window.history.length).toBe(before + 1);
  expect(window.history.state.chemiAsk).toBe(1);
  cleanup();

  window.history.replaceState(null, "", "/chemi/saju?c=changha");
  render(<SajuFlow locale="ko" birthCopy={koCatalog.myBirth} />);
  fireEvent.click(await screen.findByRole("button", { name: "지난 풀이" }));
  expect(await screen.findByRole("button", { name: "이 결과로 질문하기" })).toBeVisible();
  expect(new URLSearchParams(window.location.search).get("ask")).toBeNull();
});

it("잠긴 시주에서 자정을 입력하면 기존 출생 정보를 보존하고 갱신한 표로 돌아온다", async () => {
  const birth = { birthDate: "1998-03-02", calendar: "solar", gender: "female", birthPlace: "서울", birthTime: null, timePrecision: "unknown" };
  const api = server({
    ...baseRoutes,
    "GET /api/chemi/profile": () => Response.json({ birth, partners: [] }),
    "PUT /api/chemi/profile/birth": () => Response.json({ saved: true }),
    "POST /api/chemi/readings": () => Response.json({ ...first, result: { ...chart, timeKnown: true, pillars: { ...chart.pillars, hour: chart.pillars.day } } }),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: "태어난 시간 넣기" }));
  fireEvent.click(await screen.findByRole("button", { name: "선택" }));
  fireEvent.click(await screen.findByRole("button", { name: "선택 완료" }));
  fireEvent.click(await screen.findByLabelText(/생일 정보 저장 동의/));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(api.count("POST /api/chemi/readings")).toBe(1));
  expect(api.calls.find(call => call.key === "PUT /api/chemi/profile/birth")?.body).toEqual({
    ...birth, birthTime: "00:00", timePrecision: "exact", consent: true,
  });
  await waitFor(() => {
    expect(screen.getByText("사주 여덟 글자")).toBeVisible();
    expect(screen.queryByRole("button", { name: "태어난 시간 넣기" })).toBeNull();
  }, { timeout: 4000 });
});
