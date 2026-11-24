import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FortuneResult } from "./result";

const { toast, celebrate, getAccessToken, session, login } = vi.hoisted(() => ({
  toast: vi.fn(),
  session: { authenticated: true },
  login: vi.fn(),
  celebrate: vi.fn(),
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
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({
  celebrateReward: celebrate,
}));

afterEach(() => {
  session.authenticated = true;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("copies the public share URL and records completion only after a successful copy", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/chemi/readings")
      return Response.json({
        readingId: "reading",
        kstDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now()),
        styled: null,
        replayed: true,
        reward: {},
        result: {
          locked: false,
          score: 82,
          grade: { name: "좋은 날" },
          fields: { fandom: 88, people: 81, money: 79, rest: 83, work: 80, love: 75 },
          periods: { morning: 84, afternoon: 72, night: 88 },
          evidence: {
            dayPillar: "정유",
            yearPillar: "병오",
            relation: "무관",
            stage: "쇠",
            spirit: "화개살",
            tenGod: "식신",
            useful: "목",
            timeBasis: "시주 포함",
          },
          luck: { color: "초록", number: 3, direction: "동", item: "나무 연필" },
        },
      });
    if (path === "/api/chemi/rewards/today")
      return Response.json({ grants: [] });
    if (path === "/api/chemi/shares")
      return Response.json({
        shareId: "card",
        url: "/chemi/fortune?from=card",
      });
    return Response.json({});
  });
  const copy = vi
    .fn()
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "navigator",
    { clipboard: { writeText: copy }, userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: 0 },
  );
  render(<FortuneResult locale="ko" />);
  const [button] = await screen.findAllByRole("button", { name: "자랑하기" });
  // 머리: 점수·등급 다음 줄에 오늘 일진 한 줄 제목(04-3 · 01). 등급 이름은 한 번만.
  expect(screen.getAllByText("좋은 날")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("좋아하는 일에 손이 가는 날");
  expect(screen.getByText("창하의 한마디")).toBeVisible();
  // 분야 점수는 한 판에 6줄이고, 요약은 가장 높은 분야(덕질 88)와 가장 낮은 분야(애정 75)에만 달린다.
  const rows = [...document.querySelectorAll("ul > li > [data-fan-collapsible] > button")];
  expect(rows.map((row) => row.textContent)).toEqual([
    "덕질88혼자 깊게 팔수록 재밌는 날이야. 지난 무대 영상 정주행 가자.",
    "사람81",
    "일·학업80",
    "건강·쉼83",
    "애정75먼저 연락하기보다 오는 연락에 다정하게 답하면 충분해.",
    "금전79",
  ]);
  expect(screen.queryByText("한 걸음 먼저")).toBeNull();
  expect(rows[1]).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(rows[1]!);
  expect(rows[1]).toHaveAttribute("aria-expanded", "true");
  expect([...document.querySelector("[data-result-actions]")!.children].map((item) => item.textContent)).toEqual(["자랑하기", "다른 놀이 보기"]);
  expect(toast).not.toHaveBeenCalled();
  expect(celebrate).not.toHaveBeenCalled();
  // 자랑하기는 미리 보기 판을 열고, 판의 '링크 복사'가 실제로 보낸다(타로와 같은 판 · DF-FORT-004).
  fireEvent.click(button!);
  expect(await screen.findByRole("dialog")).toHaveTextContent("82좋은 날");
  fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" }),
    ),
  );
  expect(fetcher.mock.calls.flat()).not.toContain(
    "/api/chemi/shares/card/done",
  );
  fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.flat()).toContain("/api/chemi/shares/card/done"),
  );
  expect(copy).toHaveBeenLastCalledWith(
    new URL("/chemi/fortune?from=card&locale=ko", location.origin).href,
  );
  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "링크를 복사했어요", tone: "success" }),
  );
});

it("opens login for guests without requesting a reading", async () => {
  session.authenticated = false;
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  render(<FortuneResult locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "로그인" }));
  expect(login).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});

it("retries a failed reading and offers the play tab when birth is missing", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "CHEMI_BIRTH_REQUIRED" } },
        { status: 409 },
      ),
    );
  vi.stubGlobal("fetch", request);
  render(<FortuneResult locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(
    await screen.findByRole("link", { name: "놀기로 돌아가기" }),
  ).toHaveAttribute("href", "/chemi?locale=ko");
});

it("renders the public card for a guest and links back to Chemi", async () => {
  session.authenticated = false;
  const request = vi
    .fn()
    .mockResolvedValue(Response.json({ line: "공유한 한마디." }));
  vi.stubGlobal("fetch", request);
  render(<FortuneResult locale="ko" from="card" />);
  expect(await screen.findByText("공유한 한마디.")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "뒤로 가기" }),
  ).toHaveAttribute("href", "/chemi?locale=ko");
  expect(request).toHaveBeenCalledOnce();
});

it("sends the member to the Chemi home from the main button until questions exist", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/chemi/readings"
        ? Response.json({
            readingId: "reading",
            kstDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now()),
            styled: null,
            replayed: true,
            reward: {},
            result: {
              locked: false,
              score: 82,
              grade: { name: "좋은 날" },
              fields: { fandom: 88, people: 81, money: 79, rest: 83, work: 80, love: 75 },
              periods: { morning: 84, afternoon: 72, night: 88 },
              evidence: {
                dayPillar: "정유",
                yearPillar: "병오",
                relation: "무관",
                stage: "쇠",
                spirit: "화개살",
                tenGod: "식신",
                useful: "목",
                timeBasis: "시주 포함",
              },
              luck: { color: "초록", number: 3, direction: "동", item: "나무 연필" },
            },
          })
        : Response.json({ grants: [] }),
    ),
  );
  render(<FortuneResult locale="ko" />);
  expect(await screen.findByRole("link", { name: "다른 운세 보기" })).toHaveAttribute(
    "href",
    "/chemi?locale=ko",
  );
  expect(screen.queryByText("이 결과로 질문하기")).toBeNull();
});

it("shows the passport row when today's 3M is held for a missing passport (DF-FORT-002)", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/chemi/readings")
      return Response.json({
        readingId: "reading", kstDate: today, styled: null, replayed: false, reward: { exp: 10 },
        result: {
          locked: false, score: 72, grade: { name: "무난한 날" },
          fields: { fandom: 74, people: 66, money: 78, rest: 66, work: 74, love: 72 },
          periods: { morning: 75, afternoon: 72, night: 72 },
          evidence: { dayPillar: "신축", yearPillar: "병오", relation: "무관", stage: "양", spirit: "월살", tenGod: "정재", useful: "목", timeBasis: "시주 포함" },
          luck: { color: "초록", number: 3, direction: "동", item: "나무 연필" },
        },
      });
    if (path === "/api/chemi/rewards/today") return Response.json({ grants: [], pending: ["changha", "elina"] });
    return Response.json({});
  }));
  render(<FortuneResult locale="ko" character="elina" />);
  const row = await screen.findByRole("link", { name: /패스포트 받고 \+3M · 스탬프/ });
  expect(row).toHaveAttribute("href", "/c/elina?locale=ko");
  expect(within(row).getByRole("img", { name: "친밀 +10" })).toHaveTextContent("+10");
});
