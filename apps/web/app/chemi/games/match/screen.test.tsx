import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
  cards: ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg"],
} as const;
const photos = { changha: art, elina: art, yuna: art };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("plays all three seeded boards, reveals a miss, pauses and submits exactly one result", async () => {
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
  function tap(i: number) {
    const cell = i < 4 ? i + 1 : i + 2;
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
  await screen.findByRole("button", { name: copy.pause });
  fireEvent.click(screen.getByRole("button", { name: copy.pause }));
  expect(
    screen.queryByRole("button", { name: new RegExp("^" + copy.card) }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.continuePlay }));
  for (let stage = 1; stage <= 3; stage++) {
    const deck = board(12, "match", stage);
    if (stage === 1) {
      tap(0);
      tap(deck.findIndex((x) => x !== deck[0]));
      expect(
        screen.getAllByRole("button", { name: new RegExp(copy.openCard) }),
      ).toHaveLength(2);
      advance(40);
    }
    for (let photo = 0; photo < 4; photo++) {
      const indexes = deck.flatMap((n, i) => (n === photo ? [i] : []));
      tap(indexes[0]);
      tap(indexes[1]);
    }
    if (stage < 3) advance(40);
  }
  await screen.findByRole("button", { name: copy.share });
  expect(requests.filter((r) => r.action === "finish")).toHaveLength(1);
  expect(screen.getByText("+10 EXP")).toBeVisible();
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
  expect(requests.filter((r) => r.action === "start")).toHaveLength(0);
  const extra = await screen.findByRole("button", {
    name: copy.extraPlay + " · 10P",
  });
  fireEvent.click(extra);
  expect(await screen.findByRole("alert")).toHaveTextContent(copy.insufficient);
  expect(requests.find((r) => r.action === "start")).toMatchObject({
    character: "changha",
    extra: true,
  });
});
