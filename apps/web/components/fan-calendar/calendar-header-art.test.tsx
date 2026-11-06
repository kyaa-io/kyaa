import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarMonthHeader } from "./calendar-parts";
import { CalendarMonthArt, CalendarPhotoStack } from "./calendar-header-art";
const elina = { slug: "elina", name: "Elina", image: "/fallback.jpg" };
const changha = { slug: "changha", name: "Changha", image: "/fallback.jpg" };
afterEach(() => vi.useRealTimers());
describe("calendar header art", () => {
  it("draws the month numeral and lettering as decoration only", () => {
    const { container } = render(<CalendarMonthArt month="2026-11" />);
    expect(container.querySelector("[data-calendar-month-art]")).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent("11");
    expect(container.querySelector('img[src*="november.svg"]')).toBeInTheDocument();
  });
  it("puts the art between the arrows and keeps the month and KST for screen readers", () => {
    render(<CalendarMonthHeader month="2026-11" label="2026년 11월" headingId="month" art={<CalendarMonthArt month="2026-11" />}
      previous={{ href: "/live/calendar?month=2026-10" as Route, label: "이전 달" }} next={{ href: "/live/calendar?month=2026-12" as Route, label: "다음 달" }} />);
    const heading = screen.getByRole("heading", { name: "2026년 11월 KST" });
    expect(heading).toHaveAttribute("id", "month");
    const [previous, next] = [screen.getByRole("link", { name: "이전 달" }), screen.getByRole("link", { name: "다음 달" })];
    expect(previous.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.querySelector("[data-calendar-month-art]")).toBeInTheDocument();
  });
  it("keeps a creator's photos across month changes and cancels stale replacements", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CalendarPhotoStack celebrity={elina} />);
    expect(container.querySelector('[data-calendar-art-mode="elina"]')).toBeInTheDocument();
    rerender(<CalendarPhotoStack celebrity={changha} />);
    act(() => vi.advanceTimersByTime(70));
    rerender(<CalendarPhotoStack />);
    act(() => vi.advanceTimersByTime(140));
    expect(container.querySelector('[data-calendar-art-mode="byus"]')).toBeInTheDocument();
    expect(container.querySelector('[data-calendar-art-mode="changha"]')).not.toBeInTheDocument();
  });
});
