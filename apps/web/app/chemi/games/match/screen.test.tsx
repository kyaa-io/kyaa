import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { board, FPS, verify } from "@/features/chemi/games/engine";
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

it("keeps the cleared rounds as the week's record when the player leaves mid-game", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 22, 14));
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "lobby") return Response.json({ sound: false, freeRemaining: 3, extraRemaining: 3, ranking: [] });
    if (body.action === "start") return Response.json({ playId: "local-round", seed: 12, game: "match" });
    if (body.action === "finish") return Response.json({ score: body.score, exp: 10, shareId: "local-share" });
    if (body.action === "leave") return Response.json({ left: true });
    throw Error(body.action);
  });
  let frame: FrameRequestCallback | undefined;
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { frame = undefined; });
  const advance = (ticks: number) => { now += ((ticks + 0.01) * 1000) / FPS; act(() => frame?.(now)); };
  const tap = (i: number) => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^" + copy.card + " " + (i >= 4 ? i + 2 : i + 1) + " ") }));
    advance(1);
    advance(6);
  };
  render(<MatchScreen copy={copy} locale="ko" photos={photos} share={null} />);
  const choose = screen.getByRole("button", { name: copy.elina });
  await waitFor(() => expect(choose).toBeEnabled());
  fireEvent.click(choose);
  fireEvent.click(screen.getByRole("button", { name: copy.start }));
  await screen.findByRole("button", { name: copy.pause });
  const deck = board(12, "match", 1);
  for (let photo = 0; photo < deck.length / 2; photo++) {
    const indexes = deck.flatMap((n, i) => (n === photo ? [i] : []));
    tap(indexes[0]);
    tap(indexes[1]);
  }
  fireEvent.click(screen.getByRole("button", { name: copy.round + " 2 · " + copy.start }));
  advance(1);
  fireEvent.click(screen.getByRole("button", { name: copy.pause }));
  fireEvent.click(screen.getByRole("button", { name: copy.leave }));
  await waitFor(() => expect(requests.filter((r) => r.action === "finish")).toHaveLength(1));
  expect(requests.some((r) => r.action === "leave")).toBe(false);
  expect(requests.find((r) => r.action === "finish")).toMatchObject({ playId: "local-round", score: expect.any(Number) });
  const kept = requests.find((r) => r.action === "finish") as { ticks: number; moves: [number, number][]; score: number };
  expect(kept.score).toBeGreaterThan(0);
  // 서버가 같은 판정 함수로 다시 돌려 이 제출을 받아들인다(1라운드 완료).
  expect(verify(12, kept.ticks, kept.moves, kept.score, 1e9).stage).toBe(1);
});

it("waits for explicit 10P confirmation after the free games run out", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "lobby")
      return Response.json({
        sound: false,
        freeRemaining: 0,
        extraRemaining: 2,
        points: 12,
        extraCost: 10,
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
  const extra = await screen.findByRole("button", { name: "10P로 한 판 더" });
  expect(screen.getByText("2번")).toBeInTheDocument();
  fireEvent.click(extra);
  expect(requests.some(r => r.action === "start")).toBe(false);
  fireEvent.click(await screen.findByRole("button", { name: "10P 쓰고 시작" }));
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
      return Response.json({ sound: false, freeRemaining: 3, extraRemaining: 3, points: 0, extraCost: 10, ranking: [] });
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
