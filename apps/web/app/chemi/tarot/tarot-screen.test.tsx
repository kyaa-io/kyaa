import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";
import cardsEn from "@/content/chemi/tarot/cards.en.json";
import enCatalog from "@/features/chemi/i18n/locales/en/chemi.json";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { TarotScreen } from "./tarot-screen";
import { kstDate } from "./types";

const { auth, push, celebrate, login } = vi.hoisted(() => ({
  auth: { authenticated: false },
  push: vi.fn(),
  celebrate: vi.fn(),
  login: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(location.search) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: auth.authenticated, login, user: null, getAccessToken: async () => "token" }),
}));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: celebrate }));

const calls: { path: string; method: string; body?: string }[] = [];
let today: { readingId: string; kind: string; date: string }[] = [];
let reward: Record<string, unknown> = {};
let spread: { readingId: string | null } = { readingId: null };
let listStatus = 200;

beforeEach(() => {
  spread = { readingId: null };
  listStatus = 200;
  login.mockClear();
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
      if (path.startsWith("/api/chemi/readings?")) return listStatus === 200 ? Response.json(today) : Response.json({ error: { code: "UNAUTHORIZED" } }, { status: listStatus });
      if (path.startsWith("/api/chemi/readings/")) return Response.json({ result: { cards: [{ card: 13, reversed: true }] } });
      if (path === "/api/chemi/readings" && !auth.authenticated)
        return Response.json({ readingId: null, replayed: false, reward: {}, result: { card: 25, reversed: false }, claim: "25.0.20261123.signed" });
      if (path === "/api/chemi/readings") {
        const body = JSON.parse(String(init?.body)) as { claim?: string };
        return Response.json({ readingId: "r1", replayed: false, reward, result: { cards: [{ card: body.claim ? 40 : 25, reversed: false }] } });
      }
      if (path === "/api/chemi/rewards/today") return Response.json({ grants: [] });
      if (path === "/api/chemi/tarot/spread") return Response.json(spread);
      if (path === "/api/chemi/shares") return Response.json({ url: "/chemi/tarot?from=s1", shareId: "s1" });
      const card = path.match(/\/api\/chemi\/tarot\/cards\/(\d+)\?locale=([\w-]+)$/);
      if (card) return Response.json((card[2] === "ko" ? cards : cardsEn)[Number(card[1])]);
      return Response.json({});
    }),
  );
  history.replaceState(null, "", "/chemi/tarot?locale=ko");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = (step: "enter" | "pick" | "result" = "enter", initialReading: string | null = null, initialClaim: string | null = null) =>
  render(<TarotScreen locale="ko" initialCharacter="changha" initialStep={step} initialReading={initialReading} initialClaim={initialClaim} />);

const hangul = /[\uac00-\ud7a3]/;

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
  expect(screen.queryByRole("button", { name: "kyaa 도사" })).toBeNull();
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
  expect(celebrate).toHaveBeenCalledOnce();
  expect(celebrate).toHaveBeenCalledWith(expect.objectContaining({ points: 0, affinity: { amount: 10, text: "창하 친밀 +10" } }));
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

it.each(["changha", "dosa"] as const)("reopens %s’s historical reading without awarding points or affinity again", async (character) => {
  auth.authenticated = true;
  today = [
    { readingId: "later", kind: "daily", date: kstDate() },
    { readingId: "linked", kind: "daily", date: "2026-11-17" },
  ];
  render(<TarotScreen locale="ko" initialCharacter={character} initialStep="result" initialReading="linked" />);
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

it("opens the result from a restored flip and puts the entry scene behind it", async () => {
  auth.authenticated = true;
  today = [{ readingId: "saved", kind: "daily", date: kstDate() }];
  const address = "/chemi/tarot?locale=ko&c=changha&step=flip&r=saved";
  history.replaceState(null, "", address);
  const scene = <TarotScreen locale="ko" initialCharacter="changha" initialStep="flip" initialReading="saved" />;
  render(scene);

  fireEvent.click(await screen.findByRole("button", { name: "1/3" }));
  fireEvent.click(await screen.findByRole("button", { name: "2/3" }));
  fireEvent.click(await screen.findByRole("button", { name: "풀이 볼래" }));
  expect(await screen.findByRole("heading", { name: "XIII 죽음" })).toBeVisible();
  expect(location.search).toContain("step=result");

  act(() => history.back());
  await waitFor(() => expect(location.search).not.toContain("step="));
  expect(screen.queryByRole("heading", { name: "XIII 죽음" })).toBeNull();
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

it("speaks English from entry to result for an English guest, with no Korean left on screen", async () => {
  history.replaceState(null, "", "/chemi/tarot?locale=en");
  render(<ReadingCopyProvider value={enCatalog}><TarotScreen locale="en" initialCharacter="yuna" initialStep="enter" /></ReadingCopyProvider>);
  expect(await screen.findByText("You're here. I'll read today's card for you.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Yuna" })).toHaveAttribute("aria-pressed", "true");
  expect(document.querySelector("[data-step]")!.textContent).not.toMatch(hangul);
  history.replaceState(null, "", "/chemi/tarot?locale=en&c=yuna&step=pick");
  cleanup();
  render(<ReadingCopyProvider value={enCatalog}><TarotScreen locale="en" initialCharacter="yuna" initialStep="pick" /></ReadingCopyProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Pick a random card" }));
  expect(await screen.findByText("It's Four of Wands. It came up upright.", {}, { timeout: 4000 })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "1/3" }));
  expect(await screen.findByText(cardsEn[25].dir.up.talk.ban[0])).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "2/3" }));
  fireEvent.click(await screen.findByRole("button", { name: "See my reading" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Four of Wands" })).toBeVisible(), { timeout: 4000 });
  await screen.findByText(/Choose one thing from this reading\. Do it today\./);
  expect(screen.getByText("Love")).toBeVisible();
  expect(screen.getByText("Card type")).toBeVisible();
  expect(document.querySelector("[data-result]")!.textContent).not.toMatch(hangul);
});

it("keeps the guest's card through sign-in: the return address carries the card's claim", async () => {
  open("pick");
  fireEvent.click(await screen.findByRole("button", { name: "아무거나 뽑기" }));
  fireEvent.click(await screen.findByRole("button", { name: "건너뛰기" }, { timeout: 4000 }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "완드 4" })).toBeVisible(), { timeout: 4000 });
  fireEvent.click(screen.getAllByRole("button", { name: "로그인하고 저장" })[0]);
  expect(login).toHaveBeenCalledOnce();
  const url = new URL(location.href);
  expect(url.searchParams.get("step")).toBe("result");
  expect(url.searchParams.get("claim")).toBe("25.0.20261123.signed");
});

it("saves the claimed card as the member's first card of the day after sign-in", async () => {
  auth.authenticated = true;
  history.replaceState(null, "", "/chemi/tarot?locale=ko&c=changha&step=result&claim=40.0.20261123.signed");
  open("result", null, "40.0.20261123.signed");
  expect(await screen.findByRole("heading", { name: "컵 5" })).toBeVisible();
  const post = calls.find((call) => call.path === "/api/chemi/readings" && call.method === "POST")!;
  expect(JSON.parse(post.body!)).toMatchObject({ content: "tarot", kind: "daily", claim: "40.0.20261123.signed" });
  expect(new URL(location.href).searchParams.has("claim")).toBe(false);
  expect(screen.queryByText("저장 안 됨")).toBeNull();
});

it("asks to sign in again when the session has expired instead of a retry loop", async () => {
  auth.authenticated = true;
  listStatus = 401;
  open();
  expect(await screen.findByText("로그인이 만료되었습니다.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(login).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
});
