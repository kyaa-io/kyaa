// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FanTierJourney } from "./fan-tier-journey";

afterEach(cleanup);
const base = { locale: "ko" as const, creatorName: "엘리나", currentLabel: "실버", topLabel: "최고 등급에 도달했어요.", nextAria: "다음 등급: 골드", me: <i />, creator: <i /> };
const stops = (container: HTMLElement) => [...container.querySelectorAll("ol li")].map(li => li.getAttribute("data-state"));

describe("FanTierJourney", () => {
  it("fills the path up to the attained tier and shows the server's remaining value, also when it rounds to 0%", () => {
    const { container } = render(<FanTierJourney {...base} tier="Silver" fallback={{ nextLevel: "Gold", remaining: 1, percent: 0, maxed: false }} />);
    expect(stops(container)).toEqual(["passed", "current", "ahead", "ahead", "ahead"]);
    expect(screen.getByRole("heading", { name: "나와 엘리나" })).toBeTruthy();
    expect(screen.getByText("내 팬 등급 실버")).toBeTruthy();
    expect(screen.getByText("골드까지 1점")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "다음 등급: 골드" }).getAttribute("value")).toBe("0");
  });
  it("keeps the structure at the top tier and drops the next-tier line", () => {
    const top = { policyVersion: 2 as const, current: { key: "diamond-1" as const, tier: "Diamond" as const, subdivision: 1, rank: 11, minimumScore: 240 }, next: null, remaining: 0, progressPercent: 100 };
    const { container } = render(<FanTierJourney {...base} tier="Diamond" stage={top} currentLabel="다이아몬드" nextAria="" fallback={{ nextLevel: null, remaining: 0, percent: 100, maxed: true }} />);
    expect(stops(container).at(-1)).toBe("current");
    expect(screen.getByText("최고 등급에 도달했어요.")).toBeTruthy();
    expect(screen.queryByText(/까지/)).toBeNull();
    expect(screen.getByRole("progressbar", { name: "최고 등급에 도달했어요." }).getAttribute("value")).toBe("100");
    expect(container.querySelector("img[width='88']")).not.toBeNull();
  });
});
