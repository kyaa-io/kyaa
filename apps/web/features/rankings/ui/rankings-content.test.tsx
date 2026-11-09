// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} /> }));
import { APP_LOCALES } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/features__rankings__ui__rankings-copy";
import { rankingsSource } from "./rankings-source";
import { rankingsText } from "./rankings-copy";
import { FanRankingList, JjinfanProgress, PeriodChips, RankingClosed } from "./rankings-content";
import type { PageRanking } from "../domain/types";

const LONG = "아주아주아주긴이름의크리에이터이름이한줄을넘어가는경우에도레이아웃이깨지지않아야합니다".repeat(2);
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

it("marks the chosen period as pressed so the default week reads as selected", () => {
  const onChange = vi.fn();
  render(<PeriodChips locale="ko" period="week" onChange={onChange} />);
  expect(screen.getByRole("button", { name: "주간" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "false");
});
