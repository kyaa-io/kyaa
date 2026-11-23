import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { board, FPS } from "@/features/chemi/games/engine";
import { getMatchCopy } from "./copy";
import { MatchScreen } from "./screen";

const auth = vi.hoisted(() => ({
  authenticated: true,
  ready: true,
  user: { id: "local-member" },
  getAccessToken: async () => "local-token",
  login: vi.fn(),
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => auth,
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));
const copy = getMatchCopy("ko");
const art = {
  portrait: "/portrait.jpg",
  scene: "/scene.jpg",
  cards: ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"],
} as const;
const photos = { changha: art, elina: art, yuna: art };

beforeEach(() => {
  localStorage.setItem("chemi.match.guide", "1");
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("plays all five seeded boards, reveals a miss, pauses and submits exactly one result", async () => {
  // 앞면 미리 보기(2026-11-23 0시 KST부터 켜짐) 전의 판 흐름을 본다. 날짜가 지나도 같은 결과가 나오게 시계를 고정한다.
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 22, 14));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  const requests: Record<string, unknown>[] = [];
  const lobby = {
    sound: false,
    freeRemaining: 3,
    extraRemaining: 3,
    ranking: [],
  };
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "lobby") return Response.json(lobby);
    if (body.action === "start")
      return Response.json({ playId: "local-round", seed: 12, game: "match" });
    if (body.action === "finish")
      return Response.json({
        score: body.score,
        exp: 10,
        shareId: "local-share",
      });
    throw Error(body.action);
  });
  let frame: FrameRequestCallback | undefined;
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frame = undefined;
  });
  function advance(ticks: number) {
    now += ((ticks + 0.01) * 1000) / FPS;
    act(() => frame?.(now));
  }
  let currentStage = 1;
  function tap(i: number) {
    const cell = currentStage === 1 && i >= 4 ? i + 2 : i + 1;
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp("^" + copy.card + " " + cell + " "),
      }),
    );
    advance(1);
    advance(6);
  }
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  const choose = screen.getByRole("button", { name: copy.elina });
  await waitFor(() => expect(choose).toBeEnabled());
  fireEvent.click(choose);
  fireEvent.click(screen.getByRole("button", {name: copy.start}));
  await screen.findByRole("button", { name: copy.pause });
  fireEvent.click(screen.getByRole("button", { name: copy.pause }));
  expect(
    screen.queryByRole("button", { name: new RegExp("^" + copy.card) }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.continuePlay }));
  for (let stage = 1; stage <= 5; stage++) {
    currentStage = stage;
    const deck = board(12, "match", stage);
    if (stage === 1) {
      tap(0);
      tap(deck.findIndex((x) => x !== deck[0]));
      expect(
        screen.getAllByRole("button", { name: new RegExp(copy.openCard) }),
      ).toHaveLength(2);
      advance(40);
    }
    for (let photo = 0; photo < deck.length / 2; photo++) {
      const indexes = deck.flatMap((n, i) => (n === photo ? [i] : []));
      tap(indexes[0]);
      tap(indexes[1]);
    }
    if (stage < 5) {
      fireEvent.click(screen.getByRole("button", { name: copy.round + " " + (stage+1) + " · " + copy.start }));
      advance(1);
    }
  }
  await screen.findByRole("button", { name: copy.share });
  expect(requests.filter((r) => r.action === "finish")).toHaveLength(1);
  expect(screen.getByRole("img", { name: "10" }).closest("b")).toHaveTextContent(/EXP$/);
}, 20000);

it("waits for explicit 20P confirmation after the free games run out", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "lobby")
      return Response.json({
        sound: false,
        freeRemaining: 0,
        extraRemaining: 2,
        points: 22,
        extraCost: 20,
        ranking: [],
      });
    if (body.action === "start")
      return Response.json({ error: "INSUFFICIENT_POINTS" }, { status: 409 });
    throw Error(body.action);
  });
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  const choice = screen.getByRole("button", { name: copy.changha });
  await waitFor(() => expect(choice).toBeEnabled());
  fireEvent.click(choice);
  fireEvent.click(screen.getByRole("button", {name: copy.start}));
  expect(requests.filter((r) => r.action === "start")).toHaveLength(0);
  const extra = await screen.findByRole("button", { name: "20P로 한 판 더" });
  expect(screen.getByText("2번")).toBeInTheDocument();
  fireEvent.click(extra);
  expect(requests.some(r => r.action === "start")).toBe(false);
  fireEvent.click(await screen.findByRole("button", { name: "20P 쓰고 시작" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(copy.insufficient);
  expect(requests.find((r) => r.action === "start")).toMatchObject({
    character: "changha",
    extra: true,
  });
});

it("shows the rules and a free 2x2 practice before the first game", async () => {
  localStorage.clear();
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "lobby")
      return Response.json({ sound: false, freeRemaining: 3, extraRemaining: 3, points: 0, extraCost: 20, ranking: [] });
    throw Error(body.action);
  });
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  await waitFor(() => expect(screen.getByRole("button", { name: copy.start })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: copy.start }));
  expect(await screen.findByText(copy.rulePreview)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: copy.skip })).toBeEnabled();
  // 연습 판 [0,1,1,0]: 1·2번은 다른 사진(틀림), 1·4번과 2·3번이 짝이다.
  const card = (n: number) => screen.getByRole("button", { name: new RegExp("^" + copy.card + " " + n + " ") });
  fireEvent.click(card(1));
  fireEvent.click(card(2));
  expect(await screen.findAllByText(copy.wrong)).toHaveLength(2);
  await waitFor(() => expect(screen.queryByText(copy.wrong)).toBeNull(), { timeout: 2000 });
  fireEvent.click(card(1));
  fireEvent.click(card(4));
  fireEvent.click(card(2));
  fireEvent.click(card(3));
  expect(await screen.findByRole("button", { name: copy.start, description: copy.freePlays + " 3" })).toBeEnabled();
  expect(requests.some(r => r.action === "start")).toBe(false);
});

it("gives back a game that was issued but never received when the page reloads (DF-GAME-009)", async () => {
  sessionStorage.setItem("chemi.match.pending", JSON.stringify({ key: "6f1c2a1e-3b0b-4a59-9d55-2a0f1c4e8b11" }));
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "cancel") return Response.json({ refunded: true });
    if (body.action === "lobby")
      return Response.json({ sound: false, freeRemaining: 3, extraRemaining: 3, points: 0, extraCost: 20, ranking: [] });
    throw Error(body.action);
  });
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  await waitFor(() => expect(screen.getByRole("button", { name: copy.start })).toBeEnabled());
  // 취소가 로비보다 먼저 가야 로비가 돌려받은 판까지 센다.
  expect(requests.map(r => r.action)).toEqual(["cancel", "lobby"]);
  expect(requests[0]).toEqual({ action: "cancel", key: "6f1c2a1e-3b0b-4a59-9d55-2a0f1c4e8b11" });
  expect(screen.queryByText(copy.prevEnded)).toBeNull();
  expect(sessionStorage.getItem("chemi.match.pending")).toBeNull();
});

it("ends a game left mid-play and says so with the games left (DF-GAME-009)", async () => {
  sessionStorage.setItem("chemi.match.pending", JSON.stringify({ playId: "7a6e0f43-9d1d-4c0e-8f53-6d5b1c2e9a10" }));
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "leave") return Response.json({ left: false });
    if (body.action === "lobby")
      return Response.json({ sound: false, freeRemaining: 2, extraRemaining: 3, points: 0, extraCost: 20, ranking: [] });
    throw Error(body.action);
  });
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  const notice = (await screen.findByText(copy.prevEnded)).closest("[role=status]");
  expect(notice).toHaveTextContent(copy.prevEnded);
  expect(notice).toHaveTextContent(copy.freePlays + " 2");
  expect(requests.map(r => r.action)).toEqual(["leave", "lobby"]);
});

it("remembers the start key until the game arrives, then the game itself", async () => {
  const seen: (string | null)[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.action === "lobby")
      return Response.json({ sound: false, freeRemaining: 3, extraRemaining: 3, points: 0, extraCost: 20, ranking: [] });
    if (body.action === "start") {
      seen.push(sessionStorage.getItem("chemi.match.pending"));
      return Response.json({ playId: "local-round", seed: 12, game: "match" });
    }
    throw Error(body.action);
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  await waitFor(() => expect(screen.getByRole("button", { name: copy.start })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: copy.start }));
  await screen.findByRole("button", { name: copy.pause });
  expect(JSON.parse(seen[0] ?? "{}")).toHaveProperty("key");
  expect(JSON.parse(sessionStorage.getItem("chemi.match.pending") ?? "{}")).toEqual({ playId: "local-round" });
});
