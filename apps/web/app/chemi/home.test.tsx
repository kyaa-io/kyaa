import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChemiHome } from "./home";
import { home as copy } from "@/features/chemi/i18n/locales/ko/chemi.json";
import { GameRankings, type GameRanking } from "./game-rankings";
import { flashNumbers } from "@/features/rankings/ui/ranking-rows";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: false }) }));
vi.mock("@/features/rankings/ui/ranking-rows", () => ({
  flashNumbers: vi.fn(),
}));

it("filters the six activities and keeps the game rankings visible", () => {
  render(<ChemiHome preview copy={copy} locale="ko" growth={false} />);
  expect(screen.getByRole("link", { name: copy.fortune })).toHaveAttribute(
    "href",
    "/chemi/fortune?locale=ko",
  );
  fireEvent.click(screen.getByRole("button", { name: copy.games }));
  expect(screen.queryByRole("link", { name: copy.fortune })).toBeNull();
  expect(screen.getAllByText(copy.pair).some((node) => node.closest("[data-selected]"))).toBe(true);
  expect(screen.getByRole("complementary")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: copy.readings }));
  expect(screen.queryAllByText(copy.pair).some((node) => node.closest("[data-selected]"))).toBe(false);
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

it("shows my record once: highlighted in the top three, or on its own line below", () => {
  const row = (place: number, name: string, isMe = false) => ({ id: name, place, name, change: 0, record: `0:4${place}`, isMe });
  const game: GameRanking = { game: "pair", title: "짝 맞추기 랭킹", href: "/chemi/games/match", leaders: [row(1, "별", true)], mine: row(1, "별", true) };
  const view = render(<GameRankings label={copy.rankings} weekLabel={copy.thisWeek} mineLabel={copy.myRecord} games={[game]} />);
  expect(screen.getAllByText("0:41")).toHaveLength(1);
  expect(screen.queryByText(copy.myRecord)).toBeNull();
  expect(screen.getByRole("link", { name: `짝 맞추기 랭킹 ${copy.thisWeek}` })).toHaveAttribute("href", "/chemi/games/match");
  view.rerender(<GameRankings label={copy.rankings} weekLabel={copy.thisWeek} mineLabel={copy.myRecord}
    games={[{ ...game, leaders: [row(1, "별"), row(2, "달"), row(3, "해")], mine: row(8, "나", true) }]} />);
  expect(screen.getByText(copy.myRecord).parentElement).toHaveTextContent("8내 기록0:48");
});

it("pauses and resumes the banner from the button inside it", () => {
  render(<ChemiHome preview copy={copy} locale="ko" growth={false} />);
  fireEvent.click(screen.getByRole("button", { name: copy.pause }));
  fireEvent.click(screen.getByRole("button", { name: copy.resume }));
  expect(screen.getByRole("button", { name: copy.pause })).toBeVisible();
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

it("opens the enabled match game from the games tab and the runner", () => {
  render(<ChemiHome matchAvailable preview copy={copy} locale="ja" growth={false} />);
  fireEvent.click(screen.getByRole("button", { name: copy.games }));
  expect(screen.getByRole("link", { name: copy.pair })).toHaveAttribute("href", "/chemi/games/match?locale=ja");
  expect(screen.getByRole("link", { name: copy.run })).toHaveAttribute("href", "/chemi/games/run?locale=ja");
  for (const name of [copy.pair, copy.run]) {
    const banner = screen.getByRole("heading", { level: 1 }).closest("section")!;
    fireEvent.click(within(banner).getByRole("button", { name }));
    const row = screen.getByRole("link", { name });
    expect(row).toHaveAttribute("data-selected", "true");
    expect(within(banner).getByRole("link", { name: copy.start })).toHaveAttribute(
      "href",
      row.getAttribute("href"),
    );
  }
});
