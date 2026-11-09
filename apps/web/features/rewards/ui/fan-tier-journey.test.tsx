// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FanTierJourney } from "./fan-tier-journey";

afterEach(cleanup);
const base = { locale: "ko" as const, creatorName: "엘리나", currentLabel: "실버", topLabel: "최고 등급에 도달했어요.", nextAria: "다음 등급: 골드", me: <i />, creator: <i /> };
const stops = (container: HTMLElement) => [...container.querySelectorAll("ol li")].map(li => li.getAttribute("data-state"));

describe("FanTierJourney", () => {
  const stage = (current: [string, string, number, number, number], next: [string, string, number, number, number] | null, remaining: number, unit: "stamps" | "hearts", progressPercent = 0) => {
    const make = ([key, tier, subdivision, rank, minimumScore]: [string, string, number, number, number]) => ({ key, tier, subdivision, rank, minimumScore }) as never;
    return { policyVersion: 3 as const, current: make(current), next: next ? make(next) : null, remaining, progressPercent, unit };
  };
  it("says the slots left from Bronze, from the server's stage only (BUGS-1846)", () => {
    const { container } = render(<FanTierJourney {...base} tier="Bronze" currentLabel="브론즈" stage={stage(["bronze-1", "Bronze", 1, 1, 0], ["silver-1", "Silver", 1, 2, 0], 1, "stamps", 66)} />);
    expect(stops(container)).toEqual(["current", "ahead", "ahead", "ahead", "ahead"]);
    expect(screen.getByText("실버까지 도장 1칸")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("66");
  });
  it("says the hearts left from Silver, also when it rounds to 0%", () => {
    const { container } = render(<FanTierJourney {...base} tier="Silver" stage={stage(["silver-2", "Silver", 2, 3, 0], ["gold-1", "Gold", 1, 4, 1], 1, "hearts")} />);
    expect(stops(container)).toEqual(["passed", "current", "ahead", "ahead", "ahead"]);
    expect(screen.getByRole("heading", { name: "나와 엘리나" })).toBeTruthy();
    expect(screen.getByText("내 팬 등급 실버")).toBeTruthy();
    expect(screen.getByText("골드까지 하트 1개")).toBeTruthy();
    expect(screen.queryByText(/점/)).toBeNull();
    expect(screen.getByRole("progressbar", { name: "다음 등급: 골드" }).getAttribute("value")).toBe("0");
  });
  it("names the stage for a step inside a tier", () => {
    render(<FanTierJourney {...base} tier="Gold" stage={stage(["gold-1", "Gold", 1, 4, 1], ["gold-2", "Gold", 2, 5, 8], 5, "hearts", 28)} />);
    expect(screen.getByText("골드 2까지 하트 5개")).toBeTruthy();
  });
  it("shows the tier alone without a stage projection", () => {
    render(<FanTierJourney {...base} tier="Silver" />);
    expect(screen.queryByText(/까지/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("keeps the structure at the top tier and drops the next-tier line", () => {
    const top = { policyVersion: 2 as const, current: { key: "diamond-1" as const, tier: "Diamond" as const, subdivision: 1, rank: 11, minimumScore: 240 }, next: null, remaining: 0, progressPercent: 100, unit: "points" as const };
    const { container } = render(<FanTierJourney {...base} tier="Diamond" stage={top} currentLabel="다이아몬드" nextAria="" />);
    expect(stops(container).at(-1)).toBe("current");
    expect(screen.getByText("최고 등급에 도달했어요.")).toBeTruthy();
    expect(screen.queryByText(/까지/)).toBeNull();
    expect(screen.getByRole("progressbar", { name: "최고 등급에 도달했어요." }).getAttribute("value")).toBe("100");
    expect(container.querySelector("img[width='88']")).not.toBeNull();
  });
});
