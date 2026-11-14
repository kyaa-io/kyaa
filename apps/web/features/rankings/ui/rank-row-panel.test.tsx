// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
// The panel's keys (rkPanel*) come from rankings-source.ts; the strings here are the agreed Korean copy.
vi.mock("./rankings-copy", () => {
  const ko: Record<string, string> = {
    rkPanelToday: "오늘", rkPanelGap: "1위까지", rkPanelJjinfan: "찐팬", rkPanelFavorite: "최애", rkPanelRecent: "최근 {0}일", rkPanelFanCount: "{0}명",
  };
  return { rankingsText: (_locale: string, key: string, values: readonly unknown[] = []) => (ko[key] ?? key).replace(/\{(\d+)\}/g, (_m, i) => String(values[Number(i)])) };
});
import { readFileSync } from "node:fs";
import { RankRowPanel } from "./rank-row-panel";
import type { HomeCreatorRankingRow, HomeFanRankingRow, HomeFanProfileRef } from "../domain/types";

const creator = (over: Partial<HomeCreatorRankingRow> = {}): HomeCreatorRankingRow => ({
  rank: 2, slug: "iphyu", name: "이퓨", imageUrl: null, score: 6, hearts: 6, fans: 4, challenge: false, delta: 0, weekGain: 0, dayGain: 0, ...over,
});
const ref: HomeFanProfileRef = { kind: "home_ranking", day: "2026-11-10", computedAt: "2026-11-10T08:00:00.000Z", metric: "hearts", rank: 3, signature: "sig" };
const fan = (over: Partial<HomeFanRankingRow> = {}): HomeFanRankingRow => ({
  rank: 3, score: 9, nickname: "보라", characterId: "star-pink", tier: null, isMe: false, delta: 1, favorite: { slug: "iphyu", name: "이퓨" }, weekGain: 12, dayGain: 3, profileRef: ref, ...over,
});
const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe("RankRowPanel", () => {
  it("creator: three cells (today, the recent days, the way to first place) and no button or link", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, fans: 1234, weekGain: 310 })} days={7} locale="ko" gap={4} />);
    expect(document.getElementById("p")).toBeTruthy();
    expect(stat("오늘")).toBe("+125");
    expect(stat("최근 7일")).toBe("+310");
    expect(stat("1위까지")).toBe("4");
    expect(screen.queryByText("찐팬")).toBeNull();
    expect(screen.queryByText("현재 순위")).toBeNull();
    expect(document.querySelectorAll("dt")).toHaveLength(3);
    expect(document.querySelector("a, button")).toBeNull();
  });

  it("draws the cells the list passes after the built-in ones, and none when it passes none", () => {
    const view = render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, weekGain: 310 })} days={7} locale="ko" gap={4} extra={[{ key: "sns", label: "SNS", value: "1.2만" }]} />);
    expect(stat("SNS")).toBe("1.2만");
    expect(document.querySelectorAll("dt")).toHaveLength(4);
    view.unmount();
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, weekGain: 310 })} days={7} locale="ko" gap={4} />);
    expect(screen.queryByText("SNS")).toBeNull();
    expect(document.querySelectorAll("dt")).toHaveLength(3);
  });

  it("uses the answer's days as they are, not a fixed week", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ weekGain: 4 })} days={1} locale="ko" />);
    expect(stat("최근 1일")).toBe("+4");
    expect(screen.queryByText("최근 7일")).toBeNull();
  });

  it("leaves a zero gain out instead of showing +0", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 0, weekGain: 0 })} days={7} locale="ko" />);
    expect(screen.queryByText("+0")).toBeNull();
    expect(screen.queryByText("오늘")).toBeNull();
    expect(screen.queryByText(/최근/)).toBeNull();
  });

  it("leaves out a cell the answer has no value for: no fans, no weekGain, no dayGain, no days", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ fans: undefined, weekGain: null, dayGain: null })} days={7} locale="ko" />);
    expect(screen.queryByText("오늘")).toBeNull();
    expect(screen.queryByText("찐팬")).toBeNull();
    expect(screen.queryByText(/최근/)).toBeNull();
  });

  it("no days means no recent cell even with a weekGain; a loss keeps its sign", () => {
    const view = render(<RankRowPanel id="p" kind="creator" row={creator({ weekGain: 5 })} days={0} locale="ko" />);
    expect(screen.queryByText(/최근/)).toBeNull();
    view.unmount();
    render(<RankRowPanel id="p" kind="creator" row={creator({ weekGain: -3 })} days={2} locale="ko" />);
    expect(stat("최근 2일")).toBe("−3");
  });

  it("a cell with no value gives its place to the kind's own value: creator true fans, fan favorite", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 0, weekGain: 0, fans: 9 })} days={7} locale="ko" gap={0} />);
    expect(stat("1위까지")).toBe("0");
    expect(stat("찐팬")).toBe("9명");
    expect(document.querySelectorAll("dt")).toHaveLength(2);
    document.body.innerHTML = "";
    render(<RankRowPanel id="p" kind="fan" row={fan({ dayGain: 0, weekGain: 0 })} days={7} locale="ko" gap={null} />);
    expect(stat("최애")).toBe("이퓨");
    expect(screen.queryByText("1위까지")).toBeNull();
    expect(screen.queryByText("찐팬")).toBeNull();
    expect(document.querySelector("a, button")).toBeNull();
  });

  it("the totals the list passes come first, in the order given, before today's gain", () => {
    render(<RankRowPanel id="p" kind="fan" row={fan({ dayGain: 3, weekGain: 0 })} days={7} locale="ko" gap={null}
      extra={[{ key: "tickets", label: "응모권", value: "4" }, { key: "attendance", label: "출석일", value: "21" }, { key: "posts", label: "게시글", value: "9" }]} />);
    expect([...document.querySelectorAll("dt")].map((n) => n.textContent)).toEqual(["응모권", "출석일", "게시글", "오늘", "최애"]);
    expect(stat("출석일")).toBe("21");
  });

  it("a row with nothing to show draws no panel", () => {
    render(<RankRowPanel id="p" kind="fan" row={fan({ favorite: null, dayGain: 0, weekGain: 0 })} days={7} locale="ko" gap={null} />);
    expect(document.getElementById("p")).toBeNull();
  });

  it("shows nothing the row does not carry: no streak, no period totals", () => {
    const view = render(<RankRowPanel id="p" kind="creator" row={creator()} days={7} locale="ko" />);
    expect(view.container.textContent).not.toMatch(/연속|이번 주|누적|상세 보기/);
  });

  it("formats numbers in the viewer's locale", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 12345 })} days={7} locale="id" />);
    expect(stat("오늘")).toBe("+12.345");
  });
});

describe("펼침 영역의 왼쪽 선", () => {
  // --space-7 같은 없는 토큰이 섞이면 calc 전체가 무효가 되어 패널이 대체값으로 밀린다(대표 11/11 22:33 지적).
  const defined = new Set([...readFileSync("app/globals.css", "utf8").matchAll(/^\s*(--space-\d+):/gm)].map((m) => m[1]));
  it.each(["ranking-rows.module.css", "rank-row-panel.module.css"])("%s는 정의된 간격 토큰만 쓴다", (file) => {
    const css = readFileSync(`features/rankings/ui/${file}`, "utf8");
    const used = [...css.matchAll(/var\((--space-\d+)/g)].map((m) => m[1]);
    expect(used.filter((token) => !defined.has(token!))).toEqual([]);
  });
  it("패널은 행의 아바타 왼쪽 선(--rank-avatar-start = 12 + 28 + 8)에서 시작한다(사용자 11/12 12:35)", () => {
    expect(readFileSync("features/rankings/ui/ranking-rows.module.css", "utf8")).toContain("--rank-avatar-start: calc(var(--space-3) + var(--space-7) + var(--space-2))");
    expect(readFileSync("features/rankings/ui/rank-row-panel.module.css", "utf8")).toContain("var(--rank-avatar-start)");
  });

  describe("platform follower counts (A1)", () => {
    const platforms = () => [...document.querySelectorAll("[data-rank-platforms] li")].map((li) => [li.getAttribute("data-platform"), li.querySelector("img")?.getAttribute("alt"), li.querySelector("img")?.getAttribute("src"), li.textContent]);

    it("draws one logo and number per confirmed platform on a line of its own, in the fixed order, and no label word", () => {
      render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 1, platforms: [
        { platform: "chzzk", count: 5000 }, { platform: "youtube", count: 200000 }, { platform: "instagram", count: 12000, digits: 2, text: "1.2만" }, { platform: "tiktok", count: 100000 },
      ] })} days={7} locale="ko" gap={4} />);
      expect(platforms()).toEqual([
        ["instagram", "Instagram", "/images/guest-home/instagram.svg", "1.2만"],
        ["tiktok", "TikTok", "/images/guest-home/tiktok.svg", "100K"],
        ["youtube", "YouTube", "/images/guest-home/youtube.svg", "200K"],
        ["chzzk", "치지직", "/images/guest-home/chzzk.png", "5K"],
      ]);
      // The platform line sits outside the cell list, so the cells keep their own row.
      expect(document.querySelector("[data-rank-platforms]")?.closest("dl")).toBeNull();
      expect(document.querySelectorAll("dt")).toHaveLength(3);
    });

    it("draws a confirmed zero as 0 and leaves an unconfirmed platform out (it is simply not in the list)", () => {
      render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 1, platforms: [{ platform: "tiktok", count: 0 }] })} days={7} locale="ko" />);
      expect(platforms()).toEqual([["tiktok", "TikTok", "/images/guest-home/tiktok.svg", "0"]]);
    });

    it("no platforms: no platform line, the panel is what it was", () => {
      render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 1 })} days={7} locale="ko" />);
      expect(document.querySelector("[data-rank-platforms]")).toBeNull();
    });

    it("a creator with platforms but no cells still opens, and a fan row never draws the line", () => {
      const view = render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 0, weekGain: 0, platforms: [{ platform: "youtube", count: 3 }] })} days={0} locale="en" />);
      expect(platforms()).toEqual([["youtube", "YouTube", "/images/guest-home/youtube.svg", "3"]]);
      view.unmount();
      render(<RankRowPanel id="p" kind="fan" row={fan({ weekGain: 0, dayGain: 0, favorite: null })} days={0} locale="ko" />);
      expect(document.getElementById("p")).toBeNull();
    });
  });
});
