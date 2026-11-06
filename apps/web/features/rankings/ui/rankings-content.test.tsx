// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} /> }));
import { APP_LOCALES } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/features__rankings__ui__rankings-copy";
import { rankingsSource } from "./rankings-source";
import { rankingsText } from "./rankings-copy";
import { CreatorRankingList, FanRankingList, JjinfanProgress } from "./rankings-content";
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
    render(<CreatorRankingList locale="ko" ranking={creators} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(LONG)).toBeTruthy();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("팬미팅 준비 중")).toBeTruthy();
    expect(screen.getAllByRole("progressbar")[1].getAttribute("aria-valuenow")).toBe("37");
    expect(screen.getByText("내 하트 30개")).toBeTruthy();
  });

  it("limits the visible rows without changing the ranking data", () => {
    const many: CreatorRanking = { ...creators, rows: Array.from({ length: 9 }, (_, i) => ({ rank: i + 1, slug: `s${i}`, name: `N${i}`, imageUrl: null, score: 9 - i, jjinfanCount: 0, myHearts: null })) };
    render(<CreatorRankingList locale="ko" ranking={many} limit={5} embedded />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("N5")).toBeNull();
  });

  it("embedded form moves the meeting badge next to the name and keeps one progress bar per row", () => {
    const { container } = render(<CreatorRankingList locale="ko" ranking={creators} embedded />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    const badge = screen.getByText("팬미팅 준비 중");
    expect(badge.previousElementSibling?.textContent).toBe(LONG);
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("embedded form drops the my-hearts column only when no shown row has a value", () => {
    const none: CreatorRanking = { ...creators, rows: creators.rows.map(row => ({ ...row, myHearts: null })) };
    const without = render(<CreatorRankingList locale="ko" ranking={none} embedded />);
    expect(without.container.querySelector("ol")?.className).toMatch(/noMine/);
    without.unmount();
    const withMine = render(<CreatorRankingList locale="ko" ranking={creators} embedded />);
    expect(withMine.container.querySelector("ol")?.className).not.toMatch(/noMine/);
  });

  it("guest rows keep the my-hearts cell with a lock in place of the number, in every language", () => {
    for (const locale of APP_LOCALES) {
      const view = render(<CreatorRankingList locale={locale} ranking={creators} embedded lockedMine />);
      const cells = view.container.querySelectorAll("[data-mine-lock]");
      expect(cells).toHaveLength(creators.rows.length);
      expect(view.container.querySelector("ol")?.className).not.toMatch(/noMine/);
      for (const cell of cells) {
        expect(cell.querySelector('[role="img"]')).not.toBeNull();
        expect(cell.textContent).toBe(rankingsText(locale, "rkMyHearts", ["\u0000"]).split("\u0000")[0].trimEnd());
        expect(cell.textContent).not.toMatch(/\d/);
      }
      view.unmount();
    }
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
    expect(screen.getByText("Fan meeting in preparation")).toBeTruthy();
  });
});
