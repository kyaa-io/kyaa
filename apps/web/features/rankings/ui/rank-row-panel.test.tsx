// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
// The panel's keys (rkPanel*, rkGoFanpage, rkViewProfile, rkLoginProfile) are added to rankings-source.ts by the list owner; the strings here are the agreed Korean copy.
vi.mock("./rankings-copy", () => {
  const ko: Record<string, string> = {
    rkPanelToday: "오늘", rkPanelGap: "1위까지", rkPanelJjinfan: "찐팬", rkPanelFavorite: "최애", rkPanelRecent: "최근 {0}일", rkPanelFanCount: "{0}명",
    rkGoFanpage: "팬페이지 가기", rkViewProfile: "프로필 보기", rkLoginProfile: "로그인하고 프로필 보기",
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
  it("creator: three cells (today, the recent days, the way to first place) and the way to the fan page", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, fans: 1234, weekGain: 310 })} days={7} guest={false} locale="ko" gap={4} />);
    expect(document.getElementById("p")).toBeTruthy();
    expect(stat("오늘")).toBe("+125");
    expect(stat("최근 7일")).toBe("+310");
    expect(stat("1위까지")).toBe("4");
    expect(screen.queryByText("찐팬")).toBeNull();
    expect(screen.queryByText("현재 순위")).toBeNull();
    expect(document.querySelectorAll("dt")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "팬페이지 가기" }).getAttribute("href")).toBe("/iphyu?locale=ko");
  });

  it("draws the cells the list passes after the built-in ones, and none when it passes none", () => {
    const view = render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, weekGain: 310 })} days={7} guest={false} locale="ko" gap={4} extra={[{ key: "sns", label: "SNS", value: "1.2만" }]} />);
    expect(stat("SNS")).toBe("1.2만");
    expect(document.querySelectorAll("dt")).toHaveLength(4);
    view.unmount();
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, weekGain: 310 })} days={7} guest={false} locale="ko" gap={4} />);
    expect(screen.queryByText("SNS")).toBeNull();
    expect(document.querySelectorAll("dt")).toHaveLength(3);
  });

  it("uses the answer's days as they are, not a fixed week", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ weekGain: 4 })} days={1} guest={false} locale="ko" />);
    expect(stat("최근 1일")).toBe("+4");
    expect(screen.queryByText("최근 7일")).toBeNull();
  });

  it("leaves a zero gain out instead of showing +0", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 0, weekGain: 0 })} days={7} guest={false} locale="ko" />);
    expect(screen.queryByText("+0")).toBeNull();
    expect(screen.queryByText("오늘")).toBeNull();
    expect(screen.queryByText(/최근/)).toBeNull();
  });

  it("leaves out a cell the answer has no value for: no fans, no weekGain, no dayGain, no days", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ fans: undefined, weekGain: null, dayGain: null })} days={7} guest={false} locale="ko" />);
    expect(screen.queryByText("오늘")).toBeNull();
    expect(screen.queryByText("찐팬")).toBeNull();
    expect(screen.queryByText(/최근/)).toBeNull();
    expect(screen.getByRole("link", { name: "팬페이지 가기" })).toBeTruthy();
  });

  it("no days means no recent cell even with a weekGain; a loss keeps its sign", () => {
    const view = render(<RankRowPanel id="p" kind="creator" row={creator({ weekGain: 5 })} days={0} guest={false} locale="ko" />);
    expect(screen.queryByText(/최근/)).toBeNull();
    view.unmount();
    render(<RankRowPanel id="p" kind="creator" row={creator({ weekGain: -3 })} days={2} guest={false} locale="ko" />);
    expect(stat("최근 2일")).toBe("−3");
  });

  it("a cell with no value gives its place to the kind's own value: creator true fans, fan favorite; the button only calls the list's callback", () => {
    const open = vi.fn();
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 0, weekGain: 0, fans: 9 })} days={7} guest={false} locale="ko" gap={0} />);
    expect(stat("1위까지")).toBe("0");
    expect(stat("찐팬")).toBe("9명");
    expect(document.querySelectorAll("dt")).toHaveLength(2);
    document.body.innerHTML = "";
    render(<RankRowPanel id="p" kind="fan" row={fan({ dayGain: 0, weekGain: 0 })} days={7} guest={false} locale="ko" onOpenProfile={open} gap={null} />);
    expect(stat("최애")).toBe("이퓨");
    expect(screen.queryByText("1위까지")).toBeNull();
    expect(screen.queryByText("찐팬")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "프로필 보기" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("signed-in fan without a profile locator: the button is disabled and calls nothing", () => {
    const open = vi.fn();
    render(<RankRowPanel id="p" kind="fan" row={fan({ profileRef: undefined })} days={7} guest={false} locale="ko" onOpenProfile={open} />);
    const button = screen.getByRole("button", { name: "프로필 보기" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
  });

  it("guest fan: a sign-in link, never the profile button; a fan without a favorite has no favorite cell", () => {
    render(<RankRowPanel id="p" kind="fan" row={fan({ favorite: null, profileRef: undefined })} days={7} guest locale="ko" loginHref="/login?next=%2Frankings" onOpenProfile={vi.fn()} />);
    expect(screen.getByRole("link", { name: "로그인하고 프로필 보기" }).getAttribute("href")).toBe("/login?next=%2Frankings");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("최애")).toBeNull();
    expect(screen.queryByText("프로필 보기")).toBeNull();
  });

  it("shows nothing the row does not carry: no streak, no period totals", () => {
    const view = render(<RankRowPanel id="p" kind="creator" row={creator()} days={7} guest={false} locale="ko" />);
    expect(view.container.textContent).not.toMatch(/연속|이번 주|누적|상세 보기/);
  });

  it("formats numbers in the viewer's locale", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 12345 })} days={7} guest={false} locale="id" />);
    expect(stat("오늘")).toBe("+12.345");
  });
});

describe("펼침 영역의 왼쪽 선", () => {
  // --space-7 같은 없는 토큰이 섞이면 calc 전체가 무효가 되어 패널이 이름선(84)이 아닌 대체값으로 밀린다(대표 11/11 22:33 지적).
  const defined = new Set([...readFileSync("app/globals.css", "utf8").matchAll(/^\s*(--space-\d+):/gm)].map((m) => m[1]));
  it.each(["ranking-rows.module.css", "rank-row-panel.module.css"])("%s는 정의된 간격 토큰만 쓴다", (file) => {
    const css = readFileSync(`features/rankings/ui/${file}`, "utf8");
    const used = [...css.matchAll(/var\((--space-\d+)/g)].map((m) => m[1]);
    expect(used.filter((token) => !defined.has(token!))).toEqual([]);
  });
  it("패널은 행의 이름 시작선(--rank-name-start = 12 + 28 + 8 + 28 + 8)을 그대로 쓴다", () => {
    expect(readFileSync("features/rankings/ui/ranking-rows.module.css", "utf8")).toContain("--rank-name-start: calc(var(--space-3) + var(--space-7) + var(--space-2) + var(--space-7) + var(--space-2))");
    expect(readFileSync("features/rankings/ui/rank-row-panel.module.css", "utf8")).toContain("var(--rank-name-start)");
  });
});
