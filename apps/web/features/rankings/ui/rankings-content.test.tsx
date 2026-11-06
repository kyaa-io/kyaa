// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} /> }));
import { APP_LOCALES } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/features__rankings__ui__rankings-copy";
import { rankingsSource } from "./rankings-source";
import { rankingsText } from "./rankings-copy";
import { CreatorRankingList, FanRankingList, JjinfanProgress, RankingClosed } from "./rankings-content";
import type { CreatorRanking, PageRanking } from "../domain/types";

const LONG = "아주아주아주긴이름의크리에이터이름이한줄을넘어가는경우에도레이아웃이깨지지않아야합니다".repeat(2);
const creators: CreatorRanking = {
  period: "week", periodStart: "2026-11-02", computedAt: "2026-11-06T00:00:00Z",
  rows: [
    { rank: 1, slug: "a", name: LONG, imageUrl: null, score: 1200, jjinfanCount: 100, myHearts: 30 },
    { rank: 1, slug: "b", name: "B", imageUrl: null, score: 1200, jjinfanCount: 37, myHearts: null },
    { rank: 3, slug: "c", name: "C", imageUrl: null, score: 5, jjinfanCount: 0, myHearts: 0 },
  ],
};
// Two rows keep the plain list; three or more turn the top three into the podium.
const pair: CreatorRanking = { ...creators, rows: creators.rows.slice(0, 2) };
const many = (count: number, mine: (rank: number) => number | null = () => 0): CreatorRanking => ({ ...creators, rows: Array.from({ length: count }, (_, i) => ({ rank: i + 1, slug: `s${i}`, name: `N${i + 1}`, imageUrl: null, score: 99 - i, jjinfanCount: i, myHearts: mine(i + 1) })) });
const fans = (inTop: boolean): PageRanking => ({
  metric: "hearts", period: "week", periodStart: "2026-11-02", computedAt: null,
  rows: [{ rank: 1, score: 9, nickname: LONG, characterId: "star-pink", isMe: false }, { rank: 2, score: 9, nickname: "me", characterId: "bogus", isMe: inTop }],
  me: inTop ? { rank: 2, score: 9, inTop: true } : { rank: 105, score: 1, inTop: false },
});

describe("rankings content", () => {
  it("has every key translated into all twelve locales", () => {
    for (const key of Object.keys(rankingsSource) as (keyof typeof rankingsSource)[]) {
      for (const locale of APP_LOCALES) {
        const text = rankingsText(locale, key, ["{x}", "{y}"]);
        expect(text.length, `${locale}:${key}`).toBeGreaterThan(0);
      }
      expect(Object.keys(messages[key]).length).toBe(10);
    }
  });

  it("renders ties, long names and the progress state", () => {
    render(<CreatorRankingList locale="ko" ranking={pair} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(LONG)).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("찐팬 목표 달성")).toBeTruthy();
    expect(screen.getAllByRole("progressbar")[1].getAttribute("aria-valuenow")).toBe("37");
    expect(screen.getByText("내 하트 30개")).toBeTruthy();
  });

  it("shows the top three the same progress and goal badge as the rows below", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={creators} />);
    const podium = container.querySelectorAll("ol")[0];
    expect(within(podium as HTMLElement).getAllByRole("progressbar").map(bar => bar.getAttribute("aria-valuenow"))).toEqual(["100", "37", "0"]);
    expect(within(podium as HTMLElement).getAllByText("찐팬 목표 달성")).toHaveLength(1);
    expect(within(podium as HTMLElement).getByText("찐팬 37/100")).toBeTruthy();
  });

  it("uses the target it was given on the podium", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={creators} target={30} embedded />);
    expect(within(container.querySelector("ol") as HTMLElement).getAllByText("찐팬 목표 달성")).toHaveLength(2);
  });

  it("a closed fan ranking says when it opens and keeps my own rank, wherever that rank was", () => {
    const closed: PageRanking = { metric: "hearts", period: "all", periodStart: "2026-11-02", computedAt: null, rows: [], me: { rank: 2, score: 9, inTop: true }, available: false };
    const view = render(<RankingClosed locale="ko" ranking={closed} />);
    expect(screen.getByText("활동한 팬 100명부터 랭킹이 열려요.")).toBeTruthy();
    expect(screen.getByText("내 순위")).toBeTruthy();
    view.unmount();
    render(<RankingClosed locale="en" ranking={{ ...closed, me: null }} />);
    expect(screen.getByText("Rankings open at 100 active fans.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("limits the visible rows without changing the ranking data", () => {
    const many: CreatorRanking = { ...creators, rows: Array.from({ length: 9 }, (_, i) => ({ rank: i + 1, slug: `s${i}`, name: `N${i}`, imageUrl: null, score: 9 - i, jjinfanCount: 0, myHearts: null })) };
    render(<CreatorRankingList locale="ko" ranking={many} limit={5} embedded />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("N5")).toBeNull();
  });

  it("embedded form moves the meeting badge next to the name and keeps one progress bar per row", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={pair} embedded />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    const badge = screen.getByText("찐팬 목표 달성");
    expect(badge.previousElementSibling?.textContent).toBe(LONG);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("embedded form drops the my-hearts column only when no shown row has a value", () => {
    const none: CreatorRanking = { ...pair, rows: pair.rows.map(row => ({ ...row, myHearts: null })) };
    const without = render(<CreatorRankingList locale="ko" ranking={none} embedded />);
    expect(without.container.querySelector("ol")?.className).toMatch(/noMine/);
    without.unmount();
    const withMine = render(<CreatorRankingList locale="ko" ranking={pair} embedded />);
    expect(withMine.container.querySelector("ol")?.className).not.toMatch(/noMine/);
  });

  it("guest rows keep the my-hearts cell with a lock in place of the number, in every language", () => {
    for (const locale of APP_LOCALES) {
      const view = render(<CreatorRankingList locale={locale} ranking={pair} embedded lockedMine />);
      const cells = view.container.querySelectorAll("[data-mine-lock]");
      expect(cells).toHaveLength(pair.rows.length);
      expect(view.container.querySelector("ol")?.className).not.toMatch(/noMine/);
      for (const cell of cells) {
        expect(cell.querySelector('[role="img"]')).not.toBeNull();
        expect(cell.textContent).toBe(rankingsText(locale, "rkMyHearts", ["\u0000"]).split("\u0000")[0].trimEnd());
        expect(cell.textContent).not.toMatch(/\d/);
      }
      view.unmount();
    }
  });

  it("draws no podium under three rows", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={many(2)} embedded limit={5} />);
    expect(container.querySelector('[class*="podium"]')).toBeNull();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });

  it("three rows are the podium alone, with hearts, progress and links in reading order", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={many(3, () => 4)} embedded limit={5} />);
    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.queryByText(/내 하트/)).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/s0?locale=ko", "/s1?locale=ko", "/s2?locale=ko"]);
    expect(screen.getByText("하트 99개")).toBeTruthy();
    const sizes = [...container.querySelectorAll<HTMLElement>("[data-creator-avatar]")].map((image) => image.style.getPropertyValue("--avatar-size"));
    expect(sizes).toEqual(["72px", "56px", "56px"]);
  });

  it("five rows or more show the podium, then the fourth and fifth rows, and nothing past the limit", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={many(9)} embedded limit={5} />);
    expect(container.querySelectorAll("ol")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getAllByRole("progressbar")).toHaveLength(5);
    expect(screen.queryByText("N6")).toBeNull();
  });

  it("pins the highest row below the limit the viewer gave hearts to, and only that one", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={many(9, (rank) => (rank === 7 || rank === 9 ? 3 : 0))} embedded limit={5} />);
    const rows = container.querySelectorAll("ol:last-of-type > li");
    expect(rows).toHaveLength(3);
    expect(rows[2].className).toMatch(/pinnedRow/);
    expect(rows[2].textContent).toContain("N7");
    expect(rows[2].textContent).toContain("내 하트 3개");
    expect(screen.queryByText("N9")).toBeNull();
    expect(container.querySelector("ol:last-of-type")?.className).not.toMatch(/noMine/);
  });

  it("pins nothing for a viewer with no such row, for a guest, or on the full board", () => {
    const within = render(<CreatorRankingList locale="ko" ranking={many(9, (rank) => (rank === 2 ? 3 : 0))} embedded limit={5} />);
    expect(within.container.querySelector('[class*="pinnedRow"]')).toBeNull();
    within.unmount();
    const guest = render(<CreatorRankingList locale="ko" ranking={many(9, () => 3)} embedded limit={5} lockedMine />);
    expect(guest.container.querySelector('[class*="pinnedRow"]')).toBeNull();
    expect(guest.container.querySelectorAll("[data-mine-lock]")).toHaveLength(2);
    guest.unmount();
    const full = render(<CreatorRankingList locale="ko" ranking={many(9, () => 3)} />);
    expect(full.container.querySelector('[class*="pinnedRow"]')).toBeNull();
    expect(full.container.querySelectorAll("li")).toHaveLength(9);
  });

  it("empty ranking shows the empty state only", () => {
    render(<CreatorRankingList locale="en" ranking={{ ...creators, rows: [] }} />);
    expect(screen.getByRole("status").textContent).toBe("No rankings yet");
  });

  it("pins my rank when it is outside the top rows and not when inside", () => {
    const out = render(<FanRankingList locale="ko" ranking={fans(false)} />);
    expect(screen.getByText("내 순위")).toBeTruthy();
    expect(screen.getByText(/105위/)).toBeTruthy();
    out.unmount();
    render(<FanRankingList locale="ko" ranking={fans(true)} />);
    expect(screen.queryByText("내 순위")).toBeNull();
    expect(screen.getByText("나")).toBeTruthy();
  });

  it("caps the progress bar at the target", () => {
    render(<JjinfanProgress locale="en" count={140} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("True fan goal reached")).toBeTruthy();
  });
});
