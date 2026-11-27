// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/group-social/profile-modal", () => ({ ProfileModal: () => null }));

import type { HomeCreatorRanking, HomeFanRanking } from "../domain/types";
import { CreatorRows, FanRows, dayGainMark } from "./ranking-rows";

const head = { state: "ready" as const, day: "2026-11-17", computedAt: "2026-11-17T00:00:00Z", fetchedAt: "2026-11-17T00:01:00Z", comparable: true, weekGainDays: 7 };
const fans = (dayGain: number | null | undefined): HomeFanRanking => ({ ...head, metric: "points", me: null, rows: [{ rank: 1, score: 1234, points: 1234, hearts: 5, nickname: "보라", characterId: "star-pink", tier: null, isMe: false, delta: null, favorite: null, weekGain: null, dayGain }] });
const creators = (dayGain: number | null | undefined): HomeCreatorRanking => ({ ...head, metric: "likes", rows: [{ rank: 1, slug: "elina", name: "엘리나", imageUrl: null, score: 114, likes: 114, fans: 3, hearts: 0, challenge: false, delta: null, weekGain: null, dayGain }] });
const gainNode = (container: HTMLElement) => container.querySelector("[data-day-gain]");

describe("home ranking row: today's gain next to the value", () => {
  it("fan row: +7 beside the value, with a thousands separator and a screen-reader reading", () => {
    const { container } = render(<FanRows locale="ko" ranking={fans(7)} metric="points" scope="t" period="all" />);
    expect(gainNode(container)?.textContent).toBe("+7");
    expect(container.querySelector("[data-metric]")?.getAttribute("aria-label")).toBe("포인트 1,234, 오늘 7 늘어남");
    const big = render(<FanRows locale="ko" ranking={fans(1234)} metric="points" scope="t2" period="week" />);
    expect(gainNode(big.container)?.textContent).toBe("+1,234");
  });
  it("creator row: +7 beside the value in the seven-day period too", () => {
    const { container } = render(<CreatorRows locale="en" ranking={creators(7)} metric="likes" scope="t" period="week" />);
    expect(gainNode(container)?.textContent).toBe("+7");
    expect(container.querySelector("[data-metric]")?.getAttribute("aria-label")).toContain("Up 7 today");
  });
  it("draws nothing for 0, null, a missing value or a loss", () => {
    for (const gain of [0, null, undefined, -3]) {
      expect(gainNode(render(<FanRows locale="ko" ranking={fans(gain)} metric="points" scope="t" period="all" />).container)).toBeNull();
      expect(gainNode(render(<CreatorRows locale="ko" ranking={creators(gain)} metric="likes" scope="t" period="all" />).container)).toBeNull();
    }
  });
  it("draws nothing on the Today period: the value is that gain already", () => {
    expect(gainNode(render(<FanRows locale="ko" ranking={fans(7)} metric="points" scope="t" period="day" />).container)).toBeNull();
    expect(gainNode(render(<CreatorRows locale="ko" ranking={creators(7)} metric="likes" scope="t" period="day" />).container)).toBeNull();
    expect(dayGainMark("day", 7)).toBeUndefined();
    expect(dayGainMark("all", 7)).toBe(7);
  });

  it("updates gains without highlighting the score", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 148, height: 48, left: 0, right: 300, width: 300, x: 0, y: 100, toJSON() {} });
    const animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation);
    Element.prototype.animate = animate;
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const flashes = () => animate.mock.calls.filter((call) => JSON.stringify(call).includes("480")).length;
    try {
      const view = render(<FanRows locale="ko" ranking={fans(undefined)} metric="points" scope="t" period="all" />);
      view.rerender(<FanRows locale="ko" ranking={fans(7)} metric="points" scope="t" period="all" />);
      expect(flashes()).toBe(0); // the score stayed the same
      expect(gainNode(view.container)).toHaveTextContent("+7");
      view.rerender(<FanRows locale="ko" ranking={fans(7)} metric="points" scope="t" period="all" />);
      expect(flashes()).toBe(0); // nothing changed
      view.rerender(<FanRows locale="ko" ranking={fans(9)} metric="points" scope="t" period="all" />);
      expect(flashes()).toBe(0);
      const first = render(<FanRows locale="ko" ranking={fans(7)} metric="points" scope="u" period="all" />);
      expect(flashes()).toBe(0); // first look
      first.unmount();
    } finally {
      rect.mockRestore();
      vi.unstubAllGlobals();
      delete (Element.prototype as Partial<Element>).animate;
    }
  });
});
