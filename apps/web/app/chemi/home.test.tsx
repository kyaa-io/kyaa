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
  render(<ChemiHome weeklyRankings preview copy={copy} locale="ko" growth={false} />);
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

it("drops my record row when I am already in the top three", () => {
  const row = (place: number, name: string, isMe = false) => ({ id: name, place, name, change: 0, record: `0:4${place}`, isMe });
  const game: GameRanking = { game: "pair", title: "짝 맞추기 랭킹", href: "/chemi/games/match", leaders: [row(1, "별", true)], mine: row(1, "별", true) };
  const view = render(<GameRankings label={copy.rankings} weekLabel={copy.thisWeek} mineLabel={copy.myRecord} games={[game]} />);
  expect(screen.getAllByText("0:41")).toHaveLength(1);
  expect(screen.queryByText(copy.myRecord)).toBeNull();
  expect(screen.getByRole("link", { name: `짝 맞추기 랭킹 ${copy.thisWeek}` })).toHaveAttribute("href", "/chemi/games/match");
  view.rerender(<GameRankings label={copy.rankings} weekLabel={copy.thisWeek} mineLabel={copy.myRecord}
    games={[{ ...game, leaders: [row(1, "별"), row(2, "달"), row(3, "해")], mine: row(8, "나", true) }]} />);
  expect(screen.getByText(copy.myRecord).parentElement).toHaveTextContent("8나내 기록0:48");
});

it("pauses and resumes the banner from the button inside it", () => {
  render(<ChemiHome weeklyRankings preview copy={copy} locale="ko" growth={false} />);
  fireEvent.click(screen.getByRole("button", { name: copy.pause }));
  fireEvent.click(screen.getByRole("button", { name: copy.resume }));
  expect(screen.getByRole("button", { name: copy.pause })).toBeVisible();
});

it("controls the weekly rankings independently from preview and growth", () => {
  const view = render(<ChemiHome weeklyRankings={false} copy={copy} locale="ko" growth preview={false} />);
  expect(screen.queryByRole("link", { name: copy.start })).toBeNull();
  view.rerender(<ChemiHome weeklyRankings={false} copy={copy} locale="ko" growth={false} preview={false} />);
  expect(screen.getByRole("button", { name: copy.games })).toBeVisible();
  expect(screen.queryByRole("complementary")).toBeNull();
  view.rerender(<ChemiHome weeklyRankings copy={copy} locale="ko" growth={false} preview={false} />);
  expect(screen.getByRole("complementary", { name: copy.rankings })).toBeVisible();
  expect(screen.queryByText(copy.rankingOf.replace("{game}", copy.pair))).toBeNull();
});

it.each([true, false])("shows the open fortune first (preview=%s)", (preview) => {
  render(<ChemiHome weeklyRankings={false} copy={copy} locale="ko" growth={false} preview={preview} />);
  const fortune = screen.getByRole("link", { name: copy.fortune });
  expect(fortune.parentElement?.firstElementChild).toBe(fortune);
});

it("opens today's tarot from the list and keeps the unreleased contents pending", () => {
  render(<ChemiHome weeklyRankings={false} copy={copy} locale="ko" growth={false} preview={false} />);
  expect(screen.getByRole("link", { name: copy.tarot })).toHaveAttribute("href", "/chemi/tarot?locale=ko");
  expect(screen.getByRole("link", { name: copy.saju })).toHaveAttribute("href", "/chemi/saju?locale=ko");
  expect(screen.getByRole("link", { name: copy.zodiac })).toHaveAttribute("href", "/chemi/star?locale=ko");
});

it("opens the enabled match game from the games tab and the runner", () => {
  render(<ChemiHome matchAvailable weeklyRankings preview copy={copy} locale="ja" growth={false} />);
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

it("shows vacant slots, no personal record, and an actual zero score separately", () => {
  const game: GameRanking = { game: "run", title: "최애 런 랭킹", status: "ready", leaders: [], mine: null };
  const renderRankings = (ranking: GameRanking) => (
    <GameRankings label={copy.rankings} games={[ranking]}
      empty="아직 주간 기록이 없어요" mineEmpty="내 기록이 없어요" />
  );
  const view = render(renderRankings(game));
  // The top three places stay as 미등록; places four and five appear only with a record.
  expect(screen.getAllByRole("img", { name: "미등록" })).toHaveLength(3);
  expect(screen.getAllByText("미등록")).toHaveLength(3);
  expect(screen.getByText("아직 주간 기록이 없어요")).toBeVisible();
  expect(screen.queryByText("0")).toBeNull();
  view.rerender(renderRankings({
    ...game,
    leaders: [{ id: "fan", name: "별", place: 1, change: 0, record: "0" }],
  }));
  expect(screen.getAllByText("미등록")).toHaveLength(2);
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("내 기록이 없어요")).toBeVisible();
  view.rerender(renderRankings({
    ...game,
    leaders: [1, 2, 3, 4].map((place) => ({ id: `r${place}`, name: `팬${place}`, place, change: 0, record: "10" })),
  }));
  expect(screen.queryByText("미등록")).toBeNull();
  expect(screen.getAllByText("10")).toHaveLength(4);
});

it("opens the places after the top five with 더 보기 and counts real players above the list", () => {
  const row = (place: number, isMe = false) => ({ id: `r${place}`, name: `팬${place}`, place, change: 0, record: String(1000 - place), isMe });
  const game: GameRanking = {
    game: "run", title: "최애 런 랭킹", status: "ready", leaders: [1, 2, 3, 4, 5].map((place) => row(place)), more: [6, 7].map((place) => row(place, place === 7)),
    players: { total: 128, week: 12 }, mine: row(7, true),
  };
  render(<GameRankings label={copy.rankings} games={[game]} mineLabel="내 기록" moreLabel="더 보기" lessLabel="접기"
    playersLabel={({ total, week }) => `지금까지 ${total}명 참여 · 이번 주 ${week}명`} />);
  expect(screen.getByText("지금까지 128명 참여 · 이번 주 12명")).toBeVisible();
  expect(screen.queryByText("팬6")).toBeNull();
  expect(screen.getByText("내 기록")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(screen.getByText("팬6")).toBeVisible();
  expect(screen.getByText("팬7")).toBeVisible();
  expect(screen.queryByText("내 기록")).toBeNull();
  expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
});

it("draws no player count when nobody has finished a game", () => {
  const game: GameRanking = { game: "pair", title: "짝 맞추기 랭킹", status: "ready", leaders: [], players: { total: 0, week: 0 }, mine: null };
  render(<GameRankings label={copy.rankings} games={[game]} playersLabel={({ total }) => `지금까지 ${total}명 참여`} />);
  expect(screen.queryByText(/명 참여/)).toBeNull();
  expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
});

it("lays a matching loop video over every banner", () => {
  render(<ChemiHome weeklyRankings preview copy={copy} locale="ko" growth={false} />);
  const shown: Record<string, boolean> = {};
  for (const id of ["fortune", "saju", "zodiac", "tarot", "pair", "run"] as const) {
    fireEvent.click(screen.getByRole("button", { name: copy[id] }));
    shown[id] = document.querySelector(`[data-content="${id}"] video`) !== null;
  }
  expect(shown).toEqual({ fortune: true, saju: true, zodiac: true, tarot: true, pair: true, run: true });
});
