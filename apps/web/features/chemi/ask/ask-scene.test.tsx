import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AskScene } from "./ask-scene";
import { askPages } from "./lines";
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

/** 답이 여러 쪽이면 다음 쪽으로 넘긴다(짧은 답은 한 쪽에 다 나온다). */
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
  expect(await screen.findByText("네 일간은 병. 먼저 짧게 말을 걸어 봐.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^다음/ })).toBeNull();
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
  // 끊김은 토스트로만 알리고 최애의 대사 자리는 비운다(DF-ASK-009).
  await screen.findByRole("button", { name: "다시 보내기" });
  expect(toast).toHaveBeenCalledWith({ title: "답을 받지 못했어요. 질문 수는 그대로예요.", tone: "error" });
  expect(screen.queryByText("창하")).toBeNull();
  expect(screen.getByRole("button", { name: "다음에" })).toBeTruthy();
  expect(screen.getByLabelText("남은 질문 3개")).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
  await screen.findByText("네 일간은 병. 먼저 짧게 말을 걸어 봐.");
  expect(calls[1].body.threadId).toBe(calls[0].body.threadId);
});

it("난감한 질문은 거절하는 말과 '질문 수 그대로'를 보이고 주 버튼은 다른 질문 하기다", async () => {
  serve((_url, body) => ({
    thread: answered(body.threadId, { status: "blocked", klass: "off_topic", question: body.question, answer: "그건 풀이로 답할 수 있는 게 아니야." }),
    state: state(),
  }));
  render(<Host />);
  askGo({ step: "write", topic: "free" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "숙제 해 줘" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("질문 수 그대로")).toBeTruthy();
  expect(screen.getByLabelText("남은 질문 3개")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /자랑하기|이어 묻기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다른 질문 하기" }));
  await waitFor(() => expect(location.search).toContain("ask=topic"));
});

it("무관한 질문 뒤에는 이 풀이로 답할 수 있는 질문 둘을 고르게 하고, 누르면 입력 판에 넣기만 한다(DF-ASK-015)", async () => {
  serve((_url, body) => ({
    thread: answered(body.threadId, { status: "blocked", klass: "off_topic", question: body.question, answer: "그건 풀이로 답할 수 있는 게 아니야." }),
    state: state(),
  }));
  render(<Host />);
  askGo({ step: "write", topic: "free" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "오늘 날씨 알려 줘" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  const group = await screen.findByRole("group", { name: "예시 질문" });
  const choices = group.querySelectorAll("button");
  expect(choices).toHaveLength(2);
  const picked = choices[0].textContent!;
  fireEvent.click(choices[0]);
  await waitFor(() => expect(location.search).toContain("ask=result"));
  expect((await screen.findByLabelText("질문 입력") as HTMLTextAreaElement).value).toBe(picked);
  expect(calls).toHaveLength(1);
});

it("실제 인물 질문 뒤에는 내 연애 질문 둘로 돌린다", async () => {
  serve((_url, body) => ({
    thread: answered(body.threadId, { status: "blocked", klass: "privacy", question: body.question, answer: "나는 kyaa 속 창하야. 진짜 창하 이야기는 말 못 해." }),
    state: state(),
  }));
  render(<Host />);
  askGo({ step: "write", topic: "free" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "진짜 창하야?" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  const group = await screen.findByRole("group", { name: "예시 질문" });
  fireEvent.click(group.querySelectorAll("button")[1]);
  await waitFor(() => expect(location.search).toContain("at=love"));
});

it("위기 신호는 최애 이름표·남은 수 없이 전화 버튼 둘과 닫기만 보인다(DF-ASK-003)", async () => {
  serve((_url, body) => ({
    thread: answered(body.threadId, { status: "blocked", klass: "crisis", question: body.question, answer: "혼자 버티지 마." }),
    state: state(),
  }));
  render(<Host />);
  askGo({ step: "write", topic: "free" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "사라지고 싶어" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("지금 많이 힘들구나")).toBeTruthy();
  expect(screen.getByRole("link", { name: /109/ }).getAttribute("href")).toBe("tel:109");
  expect(screen.getByRole("link", { name: /1388/ }).getAttribute("href")).toBe("tel:1388");
  expect(screen.queryByText("창하")).toBeNull();
  expect(screen.queryByText("질문 수 그대로")).toBeNull();
  expect(screen.queryByLabelText(/남은 질문/)).toBeNull();
  expect(screen.queryByRole("button", { name: /다른 질문/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(location.search).toContain("ask=topic"));
});

it("질문 수·가격 질문은 최애가 아니라 안내 한 줄로 답한다(DF-ASK-002)", async () => {
  serve((_url, body) => ({
    thread: answered(body.threadId, { status: "blocked", klass: "service", question: body.question, answer: "질문은 하루 3개까지 무료예요. 질문 1개로 이어 묻기 1번까지 할 수 있어요." }),
    state: state(),
  }));
  render(<Host />);
  askGo({ step: "write", topic: "free" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "이거 얼마야? 환불돼?" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("질문은 하루 3개까지 무료예요. 질문 1개로 이어 묻기 1번까지 할 수 있어요.")).toBeTruthy();
  expect(screen.queryByText("창하")).toBeNull();
  expect(screen.getByRole("button", { name: "다른 질문 하기" })).toBeTruthy();
});

it("결과 화면에서 오면 주제 고르기 없이 '이 결과' 칩과 결과 맞춤 예시가 붙은 입력 판이 열린다(DF-ASK-011)", async () => {
  serve((_url, body) => ({ thread: answered(body.threadId, { topic: "free" }), state: state({ left: 2 }) }));
  function ResultHost() {
    const at = useAskLocation();
    return at ? <AskScene locale="ko" content="fortune" character="changha" readingId={reading} at={at} result="82 · 좋은 날" /> : null;
  }
  render(<ResultHost />);
  askGo({ step: "result" });
  expect(await screen.findByText("방금 본 오늘 운세로 답해 줄게. 오늘 뭐 하려고?")).toBeTruthy();
  expect(screen.getByText("이 결과")).toBeTruthy();
  expect(screen.getByText(/82 · 좋은 날/)).toBeTruthy();
  expect(screen.queryByRole("group", { name: "주제" })).toBeNull();
  expect(screen.getByRole("group", { name: "예시 질문" }).querySelectorAll("button")).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("질문 입력"), { target: { value: "오늘 그 연락 해도 될까?" } });
  fireEvent.click(screen.getByRole("button", { name: "결과 없이 묻기" }));
  await waitFor(() => expect(location.search).toContain("ask=topic"));
  // 칩을 지워도 쓰던 글은 남는다.
  fireEvent.click(await screen.findByRole("button", { name: "연애" }));
  expect((await screen.findByLabelText("질문 입력") as HTMLTextAreaElement).value).toBe("오늘 그 연락 해도 될까?");
});

it("입력 판은 여러 줄·200자이고 180자부터 글자 수가 강조된다(DF-ASK-010)", async () => {
  serve(() => ({}));
  render(<Host />);
  askGo({ step: "write", topic: "work" });
  const field = (await screen.findByLabelText("질문 입력")) as HTMLTextAreaElement;
  expect(field.tagName).toBe("TEXTAREA");
  expect(field.maxLength).toBe(200);
  expect(screen.getByText("0/200").hasAttribute("data-warn")).toBe(false);
  fireEvent.change(field, { target: { value: "가".repeat(180) } });
  expect(screen.getByText("180/200").hasAttribute("data-warn")).toBe(true);
});

it("답 아래에 고지 한 줄과 '내 풀이 근거' 펼침이 있다(DF-ASK-012)", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    String(url).includes("/evidence")
      ? Response.json({ rows: [{ kind: "basis", text: "연애는 일지를 봐요. 일지가 오, 불 기운이에요." }], hourless: true })
      : Response.json(state({ threads: [answered(id)] }))));
  render(<Host />);
  askGo({ step: "answer", thread: id });
  expect(await screen.findByText("운의 흐름을 참고로 보는 풀이예요. 정해진 미래가 아니에요.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "내 풀이 근거" }));
  expect(await screen.findByText("연애는 일지를 봐요. 일지가 오, 불 기운이에요.")).toBeTruthy();
  expect(screen.getByText("태어난 시간 없이 본 풀이")).toBeTruthy();
});

it("질문을 다 쓰면 오늘 물어본 질문을 다시 열 수 있고, 살 수 있는 자리는 없다", async () => {
  const first = answered("22222222-2222-4222-8222-222222222222");
  serve(() => new Response(JSON.stringify({ error: { code: "CHEMI_MAIL_UNVERIFIED" } }), { status: 409 }), state({ left: 0, threads: [first] }));
  const { container } = render(<Host />);
  askGo({ step: "topic" });
  expect(await screen.findByText("오늘 질문을 모두 썼어요.")).toBeTruthy();
  expect(screen.getByText("네 사주로 이야기하니까 재밌었어. 물어봐 줘서 고마워.")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "주제" })).toBeNull();
  expect(container.textContent).not.toMatch(/원\b|990|구매|결제/);
  fireEvent.click(screen.getByRole("button", { name: "내일 알려 줘" }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "메일 인증을 마치면 알림을 받을 수 있어요", tone: "error" }));
  expect(calls[0]).toEqual({ url: "/api/chemi/reminders", body: { kind: "free_ask", content: "" } });
  fireEvent.click(screen.getByRole("button", { name: /요즘 연락하는 사람이랑 잘될까/ }));
  expect(await screen.findByText("네 일간은 병. 먼저 짧게 말을 걸어 봐.")).toBeTruthy();
  expect(location.search).toContain(`aq=${first.threadId}`);
});

it("알림을 신청한 뒤에는 자랑하기가 주 버튼이고, 이어 물은 답에는 이어 묻기가 없다", async () => {
  const done = answered("22222222-2222-4222-8222-222222222222", { followupQuestion: "언제쯤?", followupAnswer: "오늘 안에 움직여." });
  serve(() => ({}), state({ left: 0, reminded: true, threads: [done] }));
  render(<Host />);
  askGo({ step: "topic" });
  expect(await screen.findByText("알림 신청함")).toBeTruthy();
  expect(screen.getByText("응, 오늘 이야기 잘 기억해 둘게.")).toBeTruthy();
  expect(screen.getByRole("button", { name: /자랑하기.*질문 \+1/ })).toBeTruthy();
  askGo({ step: "answer", thread: done.threadId });
  await turn();
  expect(await screen.findByText("오늘 안에 움직여.")).toBeTruthy();
  expect(screen.getByText("언제쯤?")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /이어 묻기/ })).toBeNull();
  // 오늘 질문을 다 썼으니 갈 곳 없는 '다른 질문' 대신 자랑하기가 주 버튼이다.
  expect(screen.queryByRole("button", { name: "다른 질문" })).toBeNull();
  expect(screen.getByRole("button", { name: /자랑하기.*질문 \+1/ })).toBeTruthy();
});

it("긴 답은 문장 끝에서 쪽을 나누고, 줄 바꿈으로 온 짧은 답은 이어 붙여 한 쪽에 담는다", () => {
  expect(askPages("네 일간은 병.\n먼저 짧게 말을 걸어 봐.")).toEqual(["네 일간은 병. 먼저 짧게 말을 걸어 봐."]);
  const paragraph = "네 일간은 병화라서 마음을 숨기기 어려운 편이야. 이번 주는 금 기운이 약해서 말이 길어지면 뜻이 흐려져. 그러니까 먼저 짧게 안부만 물어봐. 답이 늦어도 재촉하지 마.";
  const pages = askPages(paragraph);
  expect(pages.join(" ")).toBe(paragraph);
  expect(pages.length).toBeGreaterThan(1);
  for (const page of pages) expect(page.length).toBeLessThanOrEqual(80);
  expect(askPages("3.5점이야.")).toEqual(["3.5점이야."]);
});

it("답을 다 들으면 짧은 반응을 고를 수 있고, 최애가 한 마디로 받는다(서버에 보내지 않는다)", async () => {
  const first = answered("22222222-2222-4222-8222-222222222222");
  serve(() => ({}), state({ left: 2, threads: [first] }));
  render(<Host />);
  askGo({ step: "answer", thread: first.threadId });
  fireEvent.click(await screen.findByRole("button", { name: "진짜?" }));
  expect(await screen.findByText("진짜야. 네 풀이에 그렇게 나와 있어.")).toBeTruthy();
  // 고른 반응은 주소에 남아 새로 고쳐도 이어진다.
  expect(location.search).toContain("av=really");
  expect(screen.getByText("진짜?")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "고마워" })).toBeNull();
  expect(screen.getByRole("button", { name: /이어 묻기/ })).toBeTruthy();
  expect(calls).toEqual([]);
});

it("오늘 마지막 질문을 이어 묻기까지 마치면 작별 인사로 맺고, 내일 알림을 신청하면 그 대답이 나온다", async () => {
  const last = answered("22222222-2222-4222-8222-222222222222");
  const done = { ...last, followupQuestion: "언제쯤?", followupAnswer: "오늘 안에 움직여." };
  serve((url) => (url === "/api/chemi/reminders" ? {} : { thread: done, state: state({ left: 0, threads: [done] }) }), state({ left: 0, threads: [last] }));
  const { container } = render(<Host />);
  askGo({ step: "answer", thread: last.threadId });
  // 이어 묻기가 남아 있으면 그것이 주 버튼이고, 갈 곳 없는 '다른 질문' 자리에는 내일 알림이 온다.
  expect(await screen.findByRole("button", { name: /이어 묻기/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "다른 질문" })).toBeNull();
  expect(screen.getByRole("button", { name: "내일 알려 줘" })).toBeTruthy();
  expect(container.querySelector("[data-mood=close]")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /이어 묻기/ }));
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "언제쯤?" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  expect(await screen.findByText("오늘 안에 움직여.")).toBeTruthy();
  await turn();
  expect(await screen.findByText("네 사주로 이야기하니까 재밌었어. 물어봐 줘서 고마워.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "고마워" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "내일 알려 줘" }));
  expect(await screen.findByText("응, 오늘 이야기 잘 기억해 둘게.")).toBeTruthy();
  expect(screen.getByText("알림 신청함")).toBeTruthy();
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
  expect(await screen.findByText("네 일간은 병. 먼저 짧게 말을 걸어 봐.")).toBeTruthy();
  expect(location.search).toContain(`ask=answer&aq=${first.threadId}`);
});

it("다른 날 다시 오면 최애가 지난 질문부터 묻고, 고른 답에 따라 다음이 갈린다", async () => {
  const past = [answered("33333333-3333-4333-8333-333333333333", { date: "2026-01-02" }), answered("44444444-4444-4444-8444-444444444444", { date: "2026-01-01" })];
  serve(() => ({}), state({ threads: past }));
  const view = render(<Host />);
  askGo({ step: "topic" });
  expect(await screen.findByText("오늘로 3일째네. 지난번에 물어본 건 어떻게 됐어?")).toBeTruthy();
  expect(screen.getByText("요즘 연락하는 사람이랑 잘될까?")).toBeTruthy();
  expect(screen.getByLabelText("창하 3일째")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "연애" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "아직이야" }));
  expect(await screen.findByText("그렇구나. 그 얘기 더 해도 되고, 새로 물어도 돼.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "연애" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /이어 묻기/ }));
  expect(location.search).toContain("ask=follow&aq=33333333");
  view.unmount();

  history.replaceState(null, "", "/chemi/saju?step=result");
  render(<Host />);
  askGo({ step: "topic" });
  fireEvent.click(await screen.findByRole("button", { name: "잘됐어" }));
  expect(await screen.findByText("다행이다. 오늘은 뭐가 궁금해?")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /이어 묻기/ })).toBeNull();
});

it("고른 반응에 맞는 말이 이어 묻기 맨 앞에 놓인다", async () => {
  const id = "55555555-5555-4555-8555-555555555555";
  serve(() => ({}), state({ threads: [answered(id)] }));
  render(<Host />);
  askGo({ step: "answer", thread: id });
  fireEvent.click(await screen.findByRole("button", { name: "좀 걱정돼" }));
  expect(await screen.findByText("걱정 마. 풀이는 조심할 곳을 미리 알려 주는 거야.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /이어 묻기/ }));
  const group = await screen.findByRole("group", { name: "예시 질문" });
  expect([...group.querySelectorAll("button")].map((item) => item.textContent)).toEqual(["뭘 조심하면 돼?", "하나만 더 알려 줘", "왜 그렇게 나왔어?"]);
  fireEvent.click(screen.getByRole("button", { name: "뭘 조심하면 돼?" }));
  expect((screen.getByLabelText("질문 입력") as HTMLInputElement).value).toBe("뭘 조심하면 돼?");
  // 주소로 다시 열어도 같은 순서다.
  expect(location.search).toContain("ask=follow");
  expect(location.search).toContain("av=worried");
});

it("다른 최애에게 한 질문을 열면 그 최애의 이름과 말투로 답한다", async () => {
  const id = "66666666-6666-4666-8666-666666666666";
  serve(() => ({}), state({ threads: [answered(id, { character: "elina", answer: "일간이 병이에요.\n먼저 짧게 말을 걸어 봐요." })] }));
  render(<Host />);
  askGo({ step: "answer", thread: id });
  expect(await screen.findByText("일간이 병이에요. 먼저 짧게 말을 걸어 봐요.")).toBeTruthy();
  expect(screen.getByText("엘리나")).toBeTruthy();
  expect(screen.queryByText("창하")).toBeNull();
  expect(await screen.findByRole("button", { name: "정말요?" })).toBeTruthy();
});

it("가로 화면에서는 줄 바꿈으로 온 답도 한 쪽에 담는다", () => {
  expect(askPages("네 일간은 병.\n먼저 짧게 말을 걸어 봐.", true)).toEqual(["네 일간은 병. 먼저 짧게 말을 걸어 봐."]);
});

it("답이 20초 안에 오지 않으면 끊긴 것으로 보고 다시 보내기를 보인다(DF-ASK-008)", async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
    init?.method
      ? new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError"))))
      : Promise.resolve(Response.json(state()))));
  render(<Host />);
  askGo({ step: "write", topic: "work" });
  fireEvent.change(await screen.findByLabelText("질문 입력"), { target: { value: "이직해도 될까?" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  await waitFor(() => expect(timeout).toHaveBeenCalledWith(20_000));
  controller.abort();
  expect(await screen.findByRole("button", { name: "다시 보내기" })).toBeTruthy();
  expect(toast).toHaveBeenCalledWith({ title: "답을 받지 못했어요. 질문 수는 그대로예요.", tone: "error" });
  timeout.mockRestore();
});

it("질문을 다 쓴 뒤 최애는 한도·내일 이야기를 하지 않고 오늘 이야기에 대한 소감만 한다(K-b528db)", async () => {
  const { askLinesFor } = await import("./lines");
  for (const who of ["changha", "elina", "yuna", "dosa"] as const) {
    const lines = askLinesFor(who);
    for (const line of [...Object.values(lines.rest), lines.reminded]) expect(line, who).not.toMatch(/내일|한도|다 썼|남은|질문 수|기다리/);
  }
});
