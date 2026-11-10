// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
// The panel's keys (rkPanel*, rkGoFanpage, rkViewProfile, rkLoginProfile) are added to rankings-source.ts by the list owner; the strings here are the agreed Korean copy.
vi.mock("./rankings-copy", () => {
  const ko: Record<string, string> = {
    rkPanelToday: "오늘", rkPanelJjinfan: "찐팬", rkPanelFavorite: "최애", rkPanelRecent: "최근 {0}일", rkPanelFanCount: "{0}명",
    rkGoFanpage: "팬페이지 가기", rkViewProfile: "프로필 보기", rkLoginProfile: "로그인하고 프로필 보기",
  };
  return { rankingsText: (_locale: string, key: string, values: readonly unknown[] = []) => (ko[key] ?? key).replace(/\{(\d+)\}/g, (_m, i) => String(values[Number(i)])) };
});
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
  it("creator: today, true fans and the recent days, and the way to the fan page", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator({ dayGain: 125, fans: 1234, weekGain: 310 })} days={7} guest={false} locale="ko" />);
    expect(document.getElementById("p")).toBeTruthy();
    expect(stat("오늘")).toBe("+125");
    expect(stat("찐팬")).toBe("1,234명");
    expect(stat("최근 7일")).toBe("+310");
    expect(screen.getByRole("link", { name: "팬페이지 가기" }).getAttribute("href")).toBe("/iphyu?locale=ko");
  });

  it("uses the answer's days as they are, not a fixed week", () => {
    render(<RankRowPanel id="p" kind="creator" row={creator()} days={1} guest={false} locale="ko" />);
    expect(stat("최근 1일")).toBe("+0");
    expect(screen.queryByText("최근 7일")).toBeNull();
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

  it("signed-in fan: favorite replaces true fans, and the button only calls the list's callback", () => {
    const open = vi.fn();
    render(<RankRowPanel id="p" kind="fan" row={fan()} days={7} guest={false} locale="ko" onOpenProfile={open} />);
    expect(stat("최애")).toBe("이퓨");
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
