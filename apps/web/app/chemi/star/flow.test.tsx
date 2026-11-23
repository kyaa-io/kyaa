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

beforeEach(async () => {
  session.authenticated = true;
  // 앞 시험에서 열린 시트가 닫히며 남기는 기록 이동(비동기)을 먼저 흘려보낸다.
  await new Promise((resolve) => setTimeout(resolve, 20));
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
  fireEvent.click(screen.getByRole("button", { name: "별자리 운세 보기" }));
  expect(await screen.findByText("별자리 운세를 보려면 로그인해 주세요.")).toBeTruthy();
});

it("walks calc → talk 1~4 → result → chart and back one step at a time", async () => {
  const fetcher = stubFetch();
  render(<StarFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "별자리 운세 보기" }));
  expect(window.location.search).toContain("step=calc");
  await screen.findByText("1/4", undefined, { timeout: 4000 });
  expect(window.location.search).toContain("step=talk-1");
  expect(screen.getByText("황소자리")).toBeTruthy();
  const posts = fetcher.mock.calls.filter(([path, init]) => path === "/api/chemi/readings" && init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0]![1]!.body))).toEqual({ content: "star", kind: "daily", character: "changha" });
  fireEvent.click(screen.getByRole("button", { name: "영역별 운세" }));
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

function openBirthSheet(extra: (path: string, init?: RequestInit) => Response | undefined = () => undefined) {
  let birthSaved = false;
  const fetcher = stubFetch((path, init) => {
    if (path === "/api/chemi/readings" && init?.method === "POST" && !birthSaved)
      return Response.json({ error: { code: "CHEMI_BIRTH_REQUIRED" } }, { status: 409 });
    if (path === "/api/chemi/profile/birth" && init?.method === "PUT") birthSaved = true;
    return extra(path, init);
  });
  render(<StarFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "별자리 운세 보기" }));
  return fetcher;
}

it("blocks under-14 birthdays inside the sheet and keeps the next button off", async () => {
  openBirthSheet();
  expect(await screen.findByText("생일 정보")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "20150505" } });
  expect(await screen.findByText("만 14세 이상부터 이용할 수 있어요")).toBeTruthy();
  expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(true);
});

it("takes the birth time from the shared wheel and bands, never a browser time input", async () => {
  const fetcher = openBirthSheet();
  await screen.findByText("생일 정보");
  fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "19950505" } });
  expect((screen.getByLabelText("생년월일") as HTMLInputElement).value).toBe("1995.05.05");
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(document.querySelector("input[type=time]")).toBeNull();
  // 시간을 고르는 칸은 비어 있고 '모름'은 미리 체크되어 있지 않다.
  expect((screen.getByRole("checkbox", { name: "모름" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "선택" }));
  fireEvent.click(await screen.findByRole("button", { name: "대략 알아요" }));
  fireEvent.click(await screen.findByRole("button", { name: /묘시/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 보기" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([path, init]) => path === "/api/chemi/profile/birth" && init?.method === "PUT")).toBe(true));
  const put = fetcher.mock.calls.find(([path, init]) => path === "/api/chemi/profile/birth" && init?.method === "PUT")!;
  expect(JSON.parse(String(put[1]!.body))).toMatchObject({
    birthDate: "1995-05-05", calendar: "solar", birthTime: "06:00", timePrecision: "band", gender: null, consent: true,
  });
  // 저장 뒤 이어지는 계산이 끝나야 다음 시험의 주소를 건드리지 않는다.
  await screen.findByText("1/4", undefined, { timeout: 4000 });
});

it("shows the under-14 note when the server still rejects the saved birthday", async () => {
  openBirthSheet((path, init) =>
    path === "/api/chemi/profile/birth" && init?.method === "PUT"
      ? Response.json({ error: { code: "CHEMI_UNDER_14" } }, { status: 403 })
      : undefined,
  );
  await screen.findByText("생일 정보");
  fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "19950505" } });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 보기" }));
  expect(await screen.findByText("만 14세 이상부터 이용할 수 있어요")).toBeTruthy();
});

it("keeps the result address and offers a retry when loading it fails for a moment", async () => {
  window.history.replaceState(null, "", "/chemi/star?locale=ko&step=result&r=saved&c=changha");
  let fail = true;
  stubFetch((path) => {
    if (!path.startsWith("/api/chemi/readings/")) return undefined;
    return fail ? Response.json({ error: { code: "CHEMI_UNAVAILABLE" } }, { status: 503 }) : undefined;
  });
  render(<StarFlow locale="ko" restoring />);
  expect(await screen.findByText("결과를 불러오지 못했습니다")).toBeTruthy();
  expect(window.location.search).toContain("step=result");
  expect(window.location.search).toContain("r=saved");
  expect(toast).not.toHaveBeenCalled();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("heading", { name: "왜 그런지" })).toBeTruthy();
});

it("keeps the address when the network drops and clears it only for a reading that is gone", async () => {
  window.history.replaceState(null, "", "/chemi/star?locale=ko&step=result&r=gone&c=changha");
  stubFetch((path) =>
    path.startsWith("/api/chemi/readings/")
      ? Response.json({ error: { code: "CHEMI_NOT_FOUND" } }, { status: 404 })
      : undefined,
  );
  render(<StarFlow locale="ko" restoring />);
  await waitFor(() => expect(toast).toHaveBeenCalled());
  expect(window.location.search).not.toContain("r=");
});

it("reloads the result when going forward lands on an address with a different result id", async () => {
  const fetcher = stubFetch((path) =>
    path.startsWith("/api/chemi/readings/other") ? Response.json({ ...reading(), readingId: "other" }) : undefined,
  );
  render(<StarFlow locale="ko" />);
  fireEvent.click(screen.getByRole("button", { name: "별자리 운세 보기" }));
  await screen.findByText("1/4", undefined, { timeout: 4000 });
  window.history.pushState(null, "", "/chemi/star?locale=ko&step=result&r=other&c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path).startsWith("/api/chemi/readings/other?c=changha"))).toBe(true));
  expect(await screen.findByRole("heading", { name: "왜 그런지" })).toBeTruthy();
});

it("resumes a calculation address opened in a new tab instead of dropping to the entrance", async () => {
  window.history.replaceState(null, "", "/chemi/star?locale=ko&step=calc&c=elina");
  const fetcher = stubFetch();
  render(<StarFlow locale="ko" />);
  await screen.findByText("1/4", undefined, { timeout: 4000 });
  const posts = fetcher.mock.calls.filter(([path, init]) => path === "/api/chemi/readings" && init?.method === "POST");
  expect(JSON.parse(String(posts[0]![1]!.body)).character).toBe("elina");
});

function slowRestore(lateResponse: () => Response) {
  let finish: () => void = () => {};
  const late = new Promise<void>((resolve) => (finish = resolve));
  stubFetch((path) => {
    if (path.startsWith("/api/chemi/readings/a?")) return late.then(lateResponse) as unknown as Response;
    if (path.startsWith("/api/chemi/readings/b?")) return Response.json({ ...reading(), readingId: "b" });
    return undefined;
  });
  return finish;
}

async function leaveSlowRestoreForB() {
  window.history.replaceState(null, "", "/chemi/star?locale=ko&step=result&r=a&c=changha");
  render(<StarFlow locale="ko" restoring />);
  window.history.pushState(null, "", "/chemi/star?locale=ko&step=result&r=b&c=changha");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(await screen.findByRole("heading", { name: "왜 그런지" })).toBeTruthy();
}

it("ignores a slow restore that fails after the history moved to another result", async () => {
  const finish = slowRestore(() => Response.json({ error: { code: "CHEMI_NOT_FOUND" } }, { status: 404 }));
  await leaveSlowRestoreForB();
  finish();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(window.location.search).toContain("r=b");
  expect(window.location.search).toContain("step=result");
  expect(toast).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "왜 그런지" })).toBeTruthy();
});

it("ignores a slow restore that succeeds after the history moved to another result", async () => {
  const finish = slowRestore(() => Response.json({ ...reading(), readingId: "a" }));
  await leaveSlowRestoreForB();
  finish();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(window.location.search).toContain("r=b");
  expect(window.location.search).not.toContain("r=a");
  expect(screen.getByRole("heading", { name: "왜 그런지" })).toBeTruthy();
});
