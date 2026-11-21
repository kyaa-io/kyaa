import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import cards from "@/content/chemi/tarot/cards.json";
import { TarotShared } from "./tarot-shared";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const serve = (share: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const card = path.match(/\/api\/chemi\/tarot\/cards\/(\d+)$/);
      if (card) return Response.json(cards[Number(card[1])]);
      return Response.json(share);
    }),
  );

it("draws a guest's shared card from the link alone and leads to drawing one", async () => {
  serve({});
  render(<TarotShared locale="ko" card={25} character="yuna" />);
  expect(screen.getByRole("heading", { name: "완드 4" })).toBeVisible();
  expect(screen.getByText("정방향")).toBeVisible();
  expect(screen.getByRole("link", { name: "한 장 뽑을래" })).toHaveAttribute("href", "/chemi/tarot?locale=ko&c=yuna");
  expect(await screen.findByText("오늘의 뜻")).toBeVisible();
  expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).includes("/shares/"))).toBe(false);
});

it("reads a member's share card and shows an empty state when it is gone or the number is not a card", async () => {
  serve({ content: "tarot", character: "elina", card: 13, reversed: true });
  render(<TarotShared locale="ko" from="s1" character="changha" />);
  expect(await screen.findByRole("heading", { name: "XIII 죽음" })).toBeVisible();
  expect(screen.getByText("역방향")).toBeVisible();
  expect(screen.getByRole("link", { name: "한 장 뽑을래" })).toHaveAttribute("href", "/chemi/tarot?locale=ko&c=elina");
  cleanup();

  serve({ gone: true });
  render(<TarotShared locale="ko" from="s2" character="changha" />);
  expect(await screen.findByRole("link", { name: "케미로 가기" })).toHaveAttribute("href", "/chemi?locale=ko");
  cleanup();

  render(<TarotShared locale="ko" card={78} character="changha" />);
  expect(screen.getByRole("link", { name: "케미로 가기" })).toBeVisible();
});
