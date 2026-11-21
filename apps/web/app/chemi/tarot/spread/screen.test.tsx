import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TarotSpread } from "./screen";

const token = vi.hoisted(() => async () => "session");
const session = vi.hoisted(() => ({ authenticated: true, login: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: session.authenticated, login: session.login, user: { id: "member" }, getAccessToken: token }),
}));
// 카드 줄은 승인된 고르기 화면의 것을 그대로 쓴다. 여기서는 고른 자리만 넘긴다.
vi.mock("../card-rail", () => ({
  CardRail: ({ onPick }: { onPick: (slot: number) => void }) => (
    <button type="button" onClick={() => onPick(7)}>
      고르기
    </button>
  ),
}));

const side = (name: string) => ({ lead: `${name} 풀이`, rows: [["연애", "-"], ["조언", `${name} 조언`]], pair: "", share: `${name} 한 줄`, talk: {}, react: { ban: `${name} 반응`, yo: "", hao: "" } });
const saved = { readingId: "s1", kstDate: "2026-11-21", replayed: false, result: { cards: [{ card: 17, reversed: false }, { card: 1, reversed: true }, { card: 19, reversed: false }] } };
let state: unknown = { readingId: null };
const posts: unknown[] = [];
beforeEach(() => {
  state = { readingId: null };
  posts.length = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/chemi/tarot/spread" && init?.method === "POST") {
        posts.push(JSON.parse(init.body as string));
        return Response.json(saved);
      }
      if (path === "/api/chemi/tarot/spread") return Response.json(state);
      const card = path.match(/cards\/(\d+)$/);
      if (card) return Response.json({ id: Number(card[1]), dir: { up: side(`정${card[1]}`), down: side(`역${card[1]}`) } });
      return Response.json({});
    }),
  );
});
afterEach(() => {
  cleanup();
  session.authenticated = true;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("walks past, present and future, sends three different positions and shows the reading", async () => {
  render(<TarotSpread locale="ko" character="changha" />);
  expect(await screen.findByText("세 장 · 1/3")).toBeVisible();
  expect(screen.getByText("첫 장은 지나온 일이야. 끌리는 데서 멈춰.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "고르기" }));
  expect(screen.getByText("세 장 · 2/3")).toBeVisible();
  expect(screen.getAllByAltText("뽑은 카드")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "고르기" }));
  fireEvent.click(screen.getByRole("button", { name: "고르기" }));
  // 같은 자리를 세 번 골라도 서로 다른 세 자리로 보낸다.
  await waitFor(() => expect(posts).toEqual([{ character: "changha", positions: [7, 8, 9] }]));
  expect(await screen.findByRole("heading", { level: 1, name: "정19 한 줄" })).toBeVisible();
  expect(screen.getByText("정17 풀이")).toBeVisible();
  expect(screen.getByText("역1 풀이")).toBeVisible();
  expect(screen.getByText("역1 조언")).toBeVisible();
  expect(screen.getByText("정19 반응")).toBeVisible();
  expect(screen.getAllByText("역방향")).toHaveLength(1);
});

it("reopens the saved spread without drawing again", async () => {
  state = saved;
  render(<TarotSpread locale="ko" character="changha" />);
  expect(await screen.findByRole("heading", { level: 1, name: "정19 한 줄" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "고르기" })).toBeNull();
  expect(posts).toEqual([]);
});

it("asks a guest to sign in", async () => {
  session.authenticated = false;
  render(<TarotSpread locale="ko" character="changha" />);
  fireEvent.click(await screen.findByRole("button", { name: "로그인" }));
  expect(session.login).toHaveBeenCalled();
});
