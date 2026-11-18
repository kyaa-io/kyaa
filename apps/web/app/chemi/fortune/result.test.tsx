import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        styled: null,
        replayed: true,
        reward: {},
        result: {
          score: 82,
          grade: { name: "좋은 날" },
          fields: { fandom: 88, people: 81, money: 79, rest: 83, work: 80, love: 75 },
          periods: { morning: 84, afternoon: 72, night: 88 },
          evidence: { dayPillar: "정유", stage: "쇠", spirit: "화개살" },
          luck: { color: "초록" },
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
    Object.assign(Object.create(navigator), { clipboard: { writeText: copy } }),
  );
  render(<FortuneResult locale="ko" />);
  const [button] = await screen.findAllByRole("button", { name: "자랑하기" });
  expect(screen.getAllByText("좋은 날")).toHaveLength(2);
  expect(screen.getByText("창하의 한마디")).toBeVisible();
  expect(toast).not.toHaveBeenCalled();
  expect(celebrate).not.toHaveBeenCalled();
  fireEvent.click(button!);
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" }),
    ),
  );
  expect(fetcher.mock.calls.flat()).not.toContain(
    "/api/chemi/shares/card/done",
  );
  fireEvent.click(button!);
  await waitFor(() =>
    expect(fetcher.mock.calls.flat()).toContain("/api/chemi/shares/card/done"),
  );
  expect(copy).toHaveBeenLastCalledWith(
    new URL("/chemi/fortune?from=card", location.origin).href,
  );
  expect(toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ tone: "success" }),
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
            styled: null,
            replayed: true,
            reward: {},
            result: {
              score: 82,
              grade: { name: "좋은 날" },
              fields: { fandom: 88, people: 81, money: 79, rest: 83, work: 80, love: 75 },
              periods: { morning: 84, afternoon: 72, night: 88 },
              evidence: { dayPillar: "정유", stage: "쇠", spirit: "화개살" },
              luck: { color: "초록" },
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
