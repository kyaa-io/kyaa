import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/features/groups/ui/group-image", () => ({ GroupImage: () => <img alt="" /> }));
import { streakBandPage } from "../domain/dukjil-ui";
import { StreakBand } from "./streak-band";

afterEach(cleanup);
it("picks the longest streak, the first on a tie, and none when all are zero", () => {
  const streak = (page: { s: number }) => page.s;
  expect(streakBandPage([{ s: 1, n: "a" }, { s: 3, n: "b" }, { s: 3, n: "c" }], streak)?.n).toBe("b");
  expect(streakBandPage([{ s: 0 }, { s: 0 }], streak)).toBeUndefined();
});
it("draws seven days with past, today and the bonus day, and opens on press", () => {
  const open = vi.fn();
  const { container } = render(<StreakBand locale="ko" href="/elina" name="엘리나" streak={3} attendedToday={false} nextBonusIn={4} onOpen={open} />);
  const states = [...container.querySelectorAll("[data-state]")].map(cell => cell.getAttribute("data-state"));
  expect(states).toEqual(["past", "past", "past", "today", "next", "next", "next"]);
  expect(screen.getByText("연속 3일")).toBeInTheDocument();
  expect(container.querySelectorAll("[data-state] svg").length).toBe(4);
  fireEvent.click(screen.getByRole("link", { name: /엘리나/ }));
  expect(open).toHaveBeenCalled();
});
