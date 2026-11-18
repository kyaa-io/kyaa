import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./reading.fixture.json";
import { StarFlow } from "./flow";

const { toast, login, session } = vi.hoisted(() => ({
  toast: vi.fn(),
  login: vi.fn(),
  session: { authenticated: true },
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({
    ready: true,
    authenticated: session.authenticated,
    login,
    user: { id: "member" },
    getAccessToken: async () => "session",
  }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: vi.fn() }));

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
const reading = () => ({ ...fixture, kstDate: today(), reward: {}, replayed: false });

function stubFetch(extra: (path: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const custom = extra(path, init);
    if (custom) return custom;
    if (path === "/api/chemi/home") return Response.json({ participation: { period: "today", count: 128 } });
    if (path === "/api/chemi/readings") return Response.json(reading());
    if (path.startsWith("/api/chemi/readings/")) return Response.json(reading());
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

beforeEach(() => {
  session.authenticated = true;
  window.history.replaceState(null, "", "/chemi/star?locale=ko");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows the entrance with the participation count and asks guests to log in", async () => {
  session.authenticated = false;
  stubFetch();
  render(<StarFlow locale="ko" />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("별자리 운세");
  expect(await screen.findByText("오늘 128명이 봤어요")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("별자리 운세를 보려면 로그인해 주세요.")).toBeTruthy();
});

it("walks calc → talk 1~4 → result → chart and back one step at a time", async () => {
  const fetcher = stubFetch();
  render(<StarFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(window.location.search).toContain("step=calc");
  await screen.findByText("1/4", undefined, { timeout: 4000 });
  expect(window.location.search).toContain("step=talk-1");
  expect(screen.getByText("황소자리")).toBeTruthy();
  const posts = fetcher.mock.calls.filter(([path, init]) => path === "/api/chemi/readings" && init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0]![1]!.body))).toEqual({ content: "star", kind: "daily", character: "changha" });
  fireEvent.click(screen.getByRole("button", { name: "영역별로도 알려 줘" }));
  expect(await screen.findByText("2/4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "왜 그런 거야?" }));
  expect(await screen.findByText("3/4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "우리 둘은?" }));
  expect(await screen.findByText("4/4")).toBeTruthy();
  expect(screen.getByText("물병")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "오늘 정리 보기" }));
  expect(await screen.findByRole("heading", { name: "왜 그런지" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /전체 보기/ }));
  expect(await screen.findByRole("heading", { name: "행성 10개" })).toBeTruthy();
  expect(window.location.search).toContain("step=chart");
  window.history.back();
  expect(await screen.findByRole("heading", { name: "왜 그런지" })).toBeTruthy();
});

it("opens the saved result from the address and falls back to the entrance when it is not today's star reading", async () => {
  window.history.replaceState(null, "", "/chemi/star?locale=ko&step=result&r=saved&c=changha");
  const fetcher = stubFetch();
  render(<StarFlow locale="ko" restoring />);
  expect(await screen.findByRole("heading", { name: "왜 그런지" })).toBeTruthy();
  expect(fetcher.mock.calls.some(([path]) => String(path).startsWith("/api/chemi/readings/saved?c=changha"))).toBe(true);
  expect(fetcher.mock.calls.some(([path, init]) => path === "/api/chemi/readings" && init?.method === "POST")).toBe(false);
});

it("returns to the entrance with a note when the address points at another day's reading", async () => {
  window.history.replaceState(null, "", "/chemi/star?locale=ko&step=result&r=old&c=changha");
  stubFetch((path) => (path.startsWith("/api/chemi/readings/") ? Response.json({ ...reading(), kstDate: "2020-01-01" }) : undefined));
  render(<StarFlow locale="ko" restoring />);
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "오늘의 별자리 결과가 아니라 처음 화면으로 돌아왔어요." }));
  expect(await screen.findByRole("heading", { level: 1, name: "별자리 운세" })).toBeTruthy();
  expect(window.location.search).not.toContain("step=");
});

it("opens the birth sheet when no birthday is saved yet, and shows the under-14 note from the server", async () => {
  let birthSaved = false;
  stubFetch((path, init) => {
    if (path === "/api/chemi/readings" && init?.method === "POST" && !birthSaved)
      return Response.json({ error: { code: "CHEMI_BIRTH_REQUIRED" } }, { status: 409 });
    if (path === "/api/chemi/profile/birth") return Response.json({ error: { code: "CHEMI_UNDER_14" } }, { status: 403 });
    return undefined;
  });
  render(<StarFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "응, 봐 줘" }));
  expect(await screen.findByText("생일 정보")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "20150505" } });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 보기" }));
  expect(await screen.findByText("만 14세 이상부터 이용할 수 있어요")).toBeTruthy();
});
