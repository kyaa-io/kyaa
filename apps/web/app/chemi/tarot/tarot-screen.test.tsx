import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";
import { TarotScreen } from "./tarot-screen";
import { kstDate } from "./types";

const { auth, push, celebrate } = vi.hoisted(() => ({
  auth: { authenticated: false },
  push: vi.fn(),
  celebrate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: auth.authenticated, login: vi.fn(), user: null, getAccessToken: async () => "token" }),
}));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: celebrate }));

const calls: { path: string; method: string; body?: string }[] = [];
let today: { readingId: string; kind: string; date: string }[] = [];
let reward: Record<string, unknown> = {};
let spread: { readingId: string | null } = { readingId: null };

beforeEach(() => {
  spread = { readingId: null };
  auth.authenticated = false;
  today = [];
  reward = {};
  calls.length = 0;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  Element.prototype.scrollTo = vi.fn() as never;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (path.startsWith("/api/chemi/readings?")) return Response.json(today);
      if (path.startsWith("/api/chemi/readings/")) return Response.json({ result: { cards: [{ card: 13, reversed: true }] } });
      if (path === "/api/chemi/readings")
        return Response.json({ readingId: "r1", replayed: false, reward, result: { cards: [{ card: 25, reversed: false }] } });
      if (path === "/api/chemi/rewards/today") return Response.json({ grants: [] });
      if (path === "/api/chemi/tarot/spread") return Response.json(spread);
      if (path === "/api/chemi/shares") return Response.json({ url: "/chemi/tarot?from=s1", shareId: "s1" });
      const card = path.match(/\/api\/chemi\/tarot\/cards\/(\d+)$/);
      if (card) return Response.json(cards[Number(card[1])]);
      return Response.json({});
    }),
  );
  history.replaceState(null, "", "/chemi/tarot?locale=ko");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = (step: "enter" | "pick" | "result" = "enter", initialReading: string | null = null) =>
  render(<TarotScreen locale="ko" initialCharacter="changha" initialStep={step} initialReading={initialReading} />);

it("starts at the entry scene for a guest and walks to the thought step", async () => {
  open();
  expect(await screen.findByRole("heading", { name: "오늘의 타로" })).toBeVisible();
  expect(screen.getByText("왔네. 오늘 카드 한 장 뽑아 볼래?")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "한 장 뽑을래" }));
  expect(await screen.findByRole("button", { name: "떠올렸어" })).toBeVisible();
  expect(location.search).toContain("step=think");
});

it("changes the favorite on the entry scene and speaks in that voice", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "엘리나" }));
  expect(screen.getByText("왔네. 오늘 카드 한 장 뽑아 볼래요?")).toBeVisible();
  expect(location.search).toContain("c=elina");
  fireEvent.click(screen.getByRole("button", { name: "유나" }));
  expect(screen.getByText("왔네. 오늘 카드, 내가 읽어 줄게.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "kyaa 도사" }));
  expect(screen.getByText("왔구려. 오늘 카드 한 장 뽑아 보겠소?")).toBeVisible();
});

it("offers 78 cards to pick from and a random pick", async () => {
  open("pick");
  expect(await screen.findAllByRole("button", { name: /^78장 중 \d+번째 카드$/ })).toHaveLength(78);
  expect(screen.getByRole("button", { name: "아무거나 뽑기" })).toBeVisible();
  expect(screen.getByRole("slider", { name: "카드 고르기" })).toHaveAttribute("aria-valuemax", "78");
});

it("sends a guest draw without credentials and walks card → talk → result with no save", async () => {
  open("pick");
  fireEvent.click(await screen.findByRole("button", { name: "아무거나 뽑기" }));
  expect(await screen.findByText("완드 4 카드가 똑바로 나왔어.", {}, { timeout: 4000 })).toBeVisible();
  const draw = calls.find((call) => call.path === "/api/chemi/readings" && call.method === "POST")!;
  expect(JSON.parse(draw.body!)).toMatchObject({ content: "tarot", kind: "daily", character: "changha" });
  expect(calls.some((call) => call.path.startsWith("/api/chemi/readings?"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "1/3" }));
  fireEvent.click(await screen.findByRole("button", { name: "2/3" }));
  fireEvent.click(await screen.findByRole("button", { name: "풀이 볼래" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "완드 4" })).toBeVisible(), { timeout: 4000 });
  expect(screen.getAllByText("저장 안 됨").length).toBeGreaterThan(0);
  expect(screen.getByText("그림 속 상징")).toBeVisible();
});

it("shows the saved card as a revisit for a member and settles the reward once", async () => {
  auth.authenticated = true;
  today = [{ readingId: "saved", kind: "daily", date: kstDate() }];
  reward = { exp: 10 };
  open();
  // 다시 온 장면의 주 버튼은 세 장 배열(첫 1번 무료)이고, 오늘 카드는 탁자 위 카드를 눌러 연다.
  const ask = await screen.findByRole("link", { name: /3장으로 물어보기/ });
  expect(ask).toHaveAttribute("href", "/chemi/tarot/spread?locale=ko&c=changha");
  expect(ask).toHaveTextContent("첫 1번 무료");
  expect(screen.getByText("또 왔네? 이번엔 세 장으로 물어볼래?")).toBeVisible();
  expect(screen.getByRole("button", { name: "도감" })).toBeVisible();
  expect(screen.getByRole("button", { name: "친구와" })).toBeVisible();
  expect(screen.getByText("XIII 죽음")).toBeVisible();
  expect(screen.getByText("역방향")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: /오늘 카드: / }));
  expect(await screen.findByRole("heading", { name: "XIII 죽음" })).toBeVisible();
  await waitFor(() => expect(screen.getAllByText("패스포트 받고 +3P · 스탬프").length).toBeGreaterThan(0));
  const settles = calls.filter((call) => call.path === "/api/chemi/readings" && call.method === "POST");
  expect(settles).toHaveLength(1);
  expect(JSON.parse(settles[0].body!)).toMatchObject({ character: "changha", position: 0 });
  expect(celebrate).not.toHaveBeenCalled();
});

it("offers only a reopen once the free spread is used", async () => {
  auth.authenticated = true;
  today = [{ readingId: "saved", kind: "daily", date: kstDate() }];
  spread = { readingId: "spread-1" };
  open();
  const again = await screen.findByRole("link", { name: "내 세 장 다시 보기" });
  expect(again).not.toHaveTextContent("무료");
  expect(screen.queryByText(/3장으로 물어보기/)).toBeNull();
  expect(screen.getByText("세 장은 아까 본 그대로야.")).toBeVisible();
});

it("shows only what the server gave: no points, no made-up counts", async () => {
  auth.authenticated = true;
  today = [{ readingId: "saved", kind: "daily", date: kstDate() }];
  open("result");
  await screen.findByRole("heading", { name: "XIII 죽음" });
  await waitFor(() => expect(screen.getAllByText("패스포트 받고 +3P · 스탬프").length).toBeGreaterThan(0));
  expect(screen.queryByText(/스탬프 1개/)).toBeNull();
  expect(screen.queryByText(/이번 주 \d+일/)).toBeNull();
});

it("reopens the result of the linked reading on a later day, without today's rewards", async () => {
  auth.authenticated = true;
  today = [
    { readingId: "later", kind: "daily", date: kstDate() },
    { readingId: "linked", kind: "daily", date: "2026-11-17" },
  ];
  open("result", "linked");
  expect(await screen.findByRole("heading", { name: "XIII 죽음" })).toBeVisible();
  expect(screen.getByText("11월 17일의 카드")).toBeVisible();
  expect(calls.some((call) => call.path === "/api/chemi/readings/linked")).toBe(true);
  expect(calls.some((call) => call.path.startsWith("/api/chemi/readings?") && !call.path.includes("from="))).toBe(true);
  expect(calls.some((call) => call.method === "POST")).toBe(false);
  expect(calls.some((call) => call.path === "/api/chemi/rewards/today")).toBe(false);
  expect(screen.queryByText("패스포트 받고 +3P · 스탬프")).toBeNull();
});

it("falls back to today's card when the linked reading is not the member's", async () => {
  auth.authenticated = true;
  today = [{ readingId: "mine", kind: "daily", date: kstDate() }];
  open("result", "someone-else");
  await screen.findByRole("heading", { name: "XIII 죽음" });
  expect(calls.some((call) => call.path === "/api/chemi/readings/mine")).toBe(true);
});

it("goes back to the Chemi tab from the first step", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "뒤로 가기" }));
  expect(push).toHaveBeenCalledWith("/chemi?locale=ko");
});

it("lets a guest share the card with only the card number in the link, saving nothing", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  open("pick");
  fireEvent.click(await screen.findByRole("button", { name: "아무거나 뽑기" }));
  fireEvent.click(await screen.findByRole("button", { name: "1/3" }, { timeout: 4000 }));
  fireEvent.click(await screen.findByRole("button", { name: "2/3" }));
  fireEvent.click(await screen.findByRole("button", { name: "풀이 볼래" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "완드 4" })).toBeVisible(), { timeout: 4000 });
  expect(screen.queryByRole("button", { name: "이 결과로 질문하기" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "자랑하기" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: "링크 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${location.origin}/chemi/tarot?locale=ko&c=changha&card=25`));
  expect(calls.some((call) => call.path.startsWith("/api/chemi/shares"))).toBe(false);
});

it("shares a member's saved card through a share card and keeps one ask button with one action row under it", async () => {
  auth.authenticated = true;
  today = [{ readingId: "saved", kind: "daily", date: kstDate() }];
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  open("result");
  await screen.findByRole("heading", { name: "XIII 죽음" });
  expect(screen.getAllByRole("button", { name: "이 결과로 질문하기" })).toHaveLength(1);
  const rows = [...document.querySelectorAll("[data-result-actions]")];
  expect(rows).toHaveLength(2);
  for (const row of rows) expect([...row.children].map((item) => item.textContent)).toEqual(["자랑하기", "다른 놀이 보기"]);
  fireEvent.click(screen.getAllByRole("button", { name: "자랑하기" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: "링크 복사" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${location.origin}/chemi/tarot?from=s1&locale=ko`));
  const created = calls.find((call) => call.path === "/api/chemi/shares")!;
  expect(JSON.parse(created.body!)).toEqual({ readingId: "saved", character: "changha" });
  await waitFor(() => expect(calls.some((call) => call.path === "/api/chemi/shares/s1/done")).toBe(true));
});
