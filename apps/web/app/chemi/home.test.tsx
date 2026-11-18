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
  render(<ChemiHome copy={copy} locale="ko" growth={false} />);
  expect(screen.getByRole("link", { name: copy.fortune })).toHaveAttribute(
    "href",
    "/chemi/fortune?locale=ko",
  );
  fireEvent.click(screen.getByRole("button", { name: copy.games }));
  expect(screen.queryByText(copy.fortune)).toBeNull();
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
  const view = render(<GameRankings games={[game]} />);
  expect(flashNumbers).not.toHaveBeenCalled();
  view.rerender(
    <GameRankings
      games={[{ ...game, leaders: [{ ...row, record: "0:38" }] }]}
    />,
  );
  expect(flashNumbers).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    new Set(["value"]),
  );
});
