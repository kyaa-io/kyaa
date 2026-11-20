import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChemiHome } from "./home";
import { home as copy } from "@/features/chemi/i18n/locales/ko/chemi.json";
import { GameRankings, type GameRanking } from "./game-rankings";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";

vi.mock("@/features/rankings/ui/ranking-rows", () => ({
  flashNumbers: vi.fn(),
}));

it("filters the six activities without offering a pending game or leaderboard", () => {
  render(<ChemiHome preview copy={copy} locale="ko" growth={false} />);
  expect(screen.getByRole("link", { name: copy.fortune })).toHaveAttribute(
    "href",
    "/chemi/fortune?locale=ko",
  );
  fireEvent.click(screen.getByRole("button", { name: copy.games }));
  expect(screen.queryByRole("link", { name: copy.fortune })).toBeNull();
  expect(screen.getByText(copy.pair)).toBeVisible();
  expect(screen.queryByRole("complementary")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.readings }));
  expect(screen.queryByText(copy.pair)).toBeNull();
  expect(screen.getByRole("link", { name: copy.fortune })).toBeVisible();
});

it("flashes just the record when an existing player's score changes", () => {
  const row = {
    id: "a",
    place: 1,
    name: "별",
    avatar: "/chemi/changha.png",
    change: 0,
    record: "0:41",
  };
  const game: GameRanking = {
    game: "pair",
    title: "짝 맞추기 랭킹",
    leaders: [row],
    mine: null,
  };
  const view = render(<GameRankings label={copy.rankings} games={[game]} />);
  expect(flashNumbers).not.toHaveBeenCalled();
  view.rerender(
    <GameRankings label={copy.rankings}
      games={[{ ...game, leaders: [{ ...row, record: "0:38" }] }]}
    />,
  );
  expect(flashNumbers).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    new Set(["value"]),
  );
});

it("keeps production on the fortune list even for a growth deep link", () => {
  render(<ChemiHome copy={copy} locale="ko" growth preview={false} />);
  expect(screen.getByRole("link", { name: copy.start })).toBeVisible();
  expect(screen.queryByText(copy.games)).toBeNull();
  expect(screen.queryByText(copy.pair)).toBeNull();
  expect(screen.queryByText(copy.raise)).toBeNull();
});

it.each([true, false])("shows the open fortune first (preview=%s)", (preview) => {
  render(<ChemiHome copy={copy} locale="ko" growth={false} preview={preview} />);
  const fortune = screen.getByRole("link", { name: copy.fortune });
  expect(fortune.parentElement?.firstElementChild).toBe(fortune);
});

it("opens today's tarot from the list and keeps the unreleased contents pending", () => {
  render(<ChemiHome copy={copy} locale="ko" growth={false} preview={false} />);
  expect(screen.getByRole("link", { name: copy.tarot })).toHaveAttribute("href", "/chemi/tarot?locale=ko");
  expect(screen.getByRole("link", { name: copy.saju })).toHaveAttribute("href", "/chemi/saju?locale=ko");
  expect(screen.getByRole("link", { name: copy.zodiac })).toHaveAttribute("href", "/chemi/star?locale=ko");
});

it("opens the enabled match game from the games tab without enabling the runner", () => {
  render(<ChemiHome matchAvailable preview copy={copy} locale="ja" growth={false} />);
  fireEvent.click(screen.getByRole("button", { name: copy.games }));
  expect(screen.getByRole("link", { name: copy.pair })).toHaveAttribute("href", "/chemi/games/match?locale=ja");
  expect(screen.queryByRole("link", { name: copy.run })).toBeNull();
});
