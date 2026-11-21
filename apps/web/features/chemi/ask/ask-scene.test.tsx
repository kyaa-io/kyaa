import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AskScene } from "./ask-scene";
import { askGo, useAskLocation } from "./location";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, getAccessToken: async () => "session" }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));

const reading = "11111111-1111-4111-8111-111111111111";
const answered = (id: string, extra: object = {}) => ({
  threadId: id, character: "changha", content: "saju", readingId: reading, topic: "love", question: "요즘 연락하는 사람이랑 잘될까?",
  status: "answered", klass: null, answer: "네 일간은 병.\n먼저 짧게 말을 걸어 봐.", followupQuestion: null, followupAnswer: null,
  date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now()), ...extra,
});
const state = (extra: object = {}) => ({ left: 3, shareBonus: { pass: true, exp: true }, reminded: false, pausedUntil: null, threads: [], ...extra });

/** 주소의 단계대로 그리는 실제 연결(결과 화면이 하는 일)을 흉내 낸다. */
function Host() {
  const at = useAskLocation();
  return at ? <AskScene locale="ko" content="saju" character="changha" readingId={reading} at={at} /> : <p>결과</p>;
}
let calls: { url: string; body: any }[] = [];
function serve(handler: (url: string, body: any) => unknown, get: object = state()) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method) return Response.json(get);
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    const result = handler(url, body);
    return result instanceof Response ? result : Response.json(result);
  }));
}

/** 답은 한 쪽에 한 줄: 다음 쪽으로 넘긴다. */
const turn = async () => fireEvent.click(await screen.findByRole("button", { name: /^다음/ }));

beforeEach(() => {
  calls = [];
  history.replaceState(null, "", "/chemi/saju?step=result");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  // 움직임 줄이기: 대사가 바로 다 나온다(글자가 하나씩 나오는 것은 typed-line.test.tsx 가 본다).
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("주제를 고르면 최애가 되묻고, 예시를 눌러 보내면 답과 줄어든 질문 수가 보인다", async () => {
  serve((_url, body) => ({ thread: answered(body.threadId), state: state({ left: 2, threads: [answered(body.threadId)] }) }));
  render(<Host />);
  askGo({ step: "topic" });
  await screen.findByLabelText("남은 질문 3개");
  for (const topic of ["연애", "일", "돈", "관계", "이번 달", "그냥 물어볼게"]) expect(screen.getByRole("button", { name: topic })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "연애" }));
  expect(await screen.findByText("연애 이야기네. 요즘 누가 제일 마음에 걸려?")).toBeTruthy();
  expect(location.search).toContain("ask=write&at=love");
  fireEvent.click(screen.getByRole("button", { name: "요즘 연락하는 사람이랑 잘될까?" }));
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("네 일간은 병.")).toBeTruthy();
  await turn();
  expect(await screen.findByText("먼저 짧게 말을 걸어 봐.")).toBeTruthy();
  expect(screen.queryByText("네 일간은 병.")).toBeNull();
  expect(calls[0]).toMatchObject({ url: "/api/chemi/ask", body: { readingId: reading, character: "changha", content: "saju", topic: "love", question: "요즘 연락하는 사람이랑 잘될까?" } });
  expect(location.search).toContain(`ask=answer&aq=${calls[0].body.threadId}`);
  expect(screen.getByLabelText("남은 질문 2개")).toBeTruthy();
  expect(screen.getByRole("button", { name: /이어 묻기/ })).toBeTruthy();
});

it("답을 못 받으면 질문 수는 그대로이고 같은 번호로 다시 보낸다", async () => {
  let fail = true;
  serve((_url, body) => (fail ? new Response(null, { status: 503 }) : { thread: answered(body.threadId), state: state({ left: 2, threads: [answered(body.threadId)] }) }));
  render(<Host />);
  askGo({ step: "write", topic: "work" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "이직해도 될까?" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect((await screen.findByRole("alert")).textContent).toBe("답을 받지 못해 질문 수는 그대로입니다.");
  expect(screen.getByLabelText("남은 질문 3개")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
  await turn();
  await screen.findByText("먼저 짧게 말을 걸어 봐.");
  expect(calls[1].body.threadId).toBe(calls[0].body.threadId);
});

it("난감한 질문은 거절하는 말과 '질문 수 그대로'를 보이고 주 버튼은 다른 질문 하기다", async () => {
  serve((_url, body) => ({
    thread: answered(body.threadId, { status: "blocked", klass: "crisis", question: body.question, answer: "혼자 버티지 마." }),
    state: state(),
  }));
  render(<Host />);
  askGo({ step: "write", topic: "free" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "사라지고 싶어" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("질문 수 그대로")).toBeTruthy();
  expect(screen.getByText("자살예방상담전화 109 · 청소년상담전화 1388")).toBeTruthy();
  expect(screen.getByLabelText("남은 질문 3개")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /자랑하기|이어 묻기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다른 질문 하기" }));
  await waitFor(() => expect(location.search).toContain("ask=topic"));
});

it("질문을 다 쓰면 오늘 물어본 질문을 다시 열 수 있고, 살 수 있는 자리는 없다", async () => {
  const first = answered("22222222-2222-4222-8222-222222222222");
  serve(() => new Response(JSON.stringify({ error: { code: "CHEMI_MAIL_UNVERIFIED" } }), { status: 409 }), state({ left: 0, threads: [first] }));
  const { container } = render(<Host />);
  askGo({ step: "topic" });
  expect(await screen.findByText("오늘 질문을 모두 썼습니다.")).toBeTruthy();
  expect(screen.getByText("오늘 이야기 재밌었어. 내일 또 와.")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "주제" })).toBeNull();
  expect(container.textContent).not.toMatch(/원\b|990|구매|결제/);
  fireEvent.click(screen.getByRole("button", { name: "내일 알려 줘" }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "메일 인증을 마치면 알림을 받을 수 있어요", tone: "error" }));
  expect(calls[0]).toEqual({ url: "/api/chemi/reminders", body: { kind: "free_ask", content: "" } });
  fireEvent.click(screen.getByRole("button", { name: /요즘 연락하는 사람이랑 잘될까/ }));
  await turn();
  expect(await screen.findByText("먼저 짧게 말을 걸어 봐.")).toBeTruthy();
  expect(location.search).toContain(`aq=${first.threadId}`);
});

it("알림을 신청한 뒤에는 자랑하기가 주 버튼이고, 이어 물은 답에는 이어 묻기가 없다", async () => {
  const done = answered("22222222-2222-4222-8222-222222222222", { followupQuestion: "언제쯤?", followupAnswer: "오늘 안에 움직여." });
  serve(() => ({}), state({ left: 0, reminded: true, threads: [done] }));
  render(<Host />);
  askGo({ step: "topic" });
  expect(await screen.findByText("알림 신청함")).toBeTruthy();
  expect(screen.getByText("응, 내일 기다릴게.")).toBeTruthy();
  expect(screen.getByRole("button", { name: /자랑하기.*질문 \+1/ })).toBeTruthy();
  askGo({ step: "answer", thread: done.threadId });
  await turn();
  await turn();
  expect(await screen.findByText("오늘 안에 움직여.")).toBeTruthy();
  expect(screen.getByText("언제쯤?")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /이어 묻기/ })).toBeNull();
  expect(screen.getByRole("button", { name: "다른 질문" })).toBeTruthy();
});

it("찾을 수 없는 질문 번호로 열리면 주제 고르기로 돌아간다", async () => {
  serve(() => ({}));
  render(<Host />);
  askGo({ step: "answer", thread: "33333333-3333-4333-8333-333333333333" });
  await screen.findByRole("group", { name: "주제" });
  expect(location.search).toContain("ask=topic");
});

it("같은 날 다시 오면 인사가 짧고, 이어 묻기가 남은 오늘 질문으로 돌아가는 주 버튼이 있다", async () => {
  const first = answered("22222222-2222-4222-8222-222222222222");
  serve(() => ({}), state({ left: 2, threads: [first] }));
  render(<Host />);
  askGo({ step: "topic" });
  expect(await screen.findByText("또 뭐 볼래?")).toBeTruthy();
  expect(screen.getByRole("group", { name: "주제" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /이어 묻기/ }));
  expect(await screen.findByText("네 일간은 병.")).toBeTruthy();
  expect(location.search).toContain(`ask=answer&aq=${first.threadId}`);
});
