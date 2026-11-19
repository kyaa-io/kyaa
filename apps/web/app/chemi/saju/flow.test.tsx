import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { showFanToast } from "@/components/fan-ui/fan-toast";
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
  render(<SajuFlow locale="ko" restoring={restoring} />);
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

async function fillNewPartner(save: boolean) {
  const sheet = await screen.findByRole("dialog", { name: "궁합 상대" });
  fireEvent.change(within(sheet).getByLabelText("별명"), { target: { value: "하나" } });
  fireEvent.change(within(sheet).getByLabelText("생년월일"), { target: { value: "20000101" } });
  fireEvent.click(within(sheet).getByLabelText("모름"));
  if (save) fireEvent.click(within(sheet).getByLabelText("이 사람 저장"));
  fireEvent.click(within(sheet).getByRole("button", { name: "궁합 보기" }));
}
const noPartners: Record<string, Route> = {
  ...baseRoutes,
  "GET /api/chemi/profile": () => Response.json({ birth: null, partners: [] }),
};

it("저장하지 않기로 한 상대는 결과를 받은 바로 뒤에 서버에서 지운다", async () => {
  const api = server({
    ...noPartners,
    "POST /api/chemi/partners": () => Response.json({ partnerId: "temp-1" }),
    "POST /api/chemi/readings": () => Response.json(pairReading),
    "DELETE /api/chemi/partners": () => Response.json({ deleted: true }),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  await fillNewPartner(false);
  expect(await screen.findByText("나 × 하나", {}, { timeout: 4000 })).toBeVisible();
  await waitFor(() => expect(api.count("DELETE /api/chemi/partners")).toBe(1));
  expect(api.calls.find((call) => call.key === "DELETE /api/chemi/partners")?.body).toEqual({ partnerId: "temp-1" });
  expect(window.localStorage.getItem("chemi:saju:temporary-partners")).toBeNull();
});

it("저장하기로 한 상대는 지우지 않는다", async () => {
  const api = server({
    ...noPartners,
    "POST /api/chemi/partners": () => Response.json({ partnerId: "kept-1" }),
    "POST /api/chemi/readings": () => Response.json(pairReading),
  });
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  await fillNewPartner(true);
  expect(await screen.findByText("나 × 하나", {}, { timeout: 4000 })).toBeVisible();
  expect(api.count("DELETE /api/chemi/partners")).toBe(0);
});

it("지우기에 실패한 임시 상대는 번호를 남겨 두었다가 다음 방문에서 다시 지운다", async () => {
  let deletes = 0;
  const routes: Record<string, Route> = {
    ...noPartners,
    "POST /api/chemi/partners": () => Response.json({ partnerId: "temp-1" }),
    "POST /api/chemi/readings": () => Response.json(pairReading),
    "DELETE /api/chemi/partners": () =>
      ++deletes === 1 ? Response.json({ error: { code: "CHEMI_UNAVAILABLE" } }, { status: 503 }) : Response.json({ deleted: true }),
  };
  server(routes);
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  fireEvent.click(await screen.findByRole("button", { name: /^궁합/ }));
  await fillNewPartner(false);
  expect(await screen.findByText("나 × 하나", {}, { timeout: 4000 })).toBeVisible();
  await waitFor(() => expect(deletes).toBe(1));
  expect(JSON.parse(window.localStorage.getItem("chemi:saju:temporary-partners")!)).toEqual(["temp-1"]);
  // 다음 방문: 화면을 새로 열면 남은 번호를 다시 지운다.
  document.body.innerHTML = "";
  await openResult("/chemi/saju?step=result&c=changha&r=first-1");
  await waitFor(() => expect(deletes).toBe(2));
  await waitFor(() => expect(window.localStorage.getItem("chemi:saju:temporary-partners")).toBeNull());
});
