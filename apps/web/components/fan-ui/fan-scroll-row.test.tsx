import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FanScrollRow } from "./fan-scroll-row";
afterEach(cleanup);
const arrow = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

const layout = (track: HTMLElement, { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number }) => {
  Object.defineProperties(track, { scrollWidth: { configurable: true, value: scrollWidth }, clientWidth: { configurable: true, value: clientWidth }, scrollLeft: { configurable: true, value: scrollLeft, writable: true } });
};

it("hides the arrow at each end and scrolls 85% of the row width", () => {
  render(<FanScrollRow locale="ko" label="숏폼"><li>a</li><li>b</li></FanScrollRow>);
  const track = screen.getByRole("list");
  layout(track, { scrollWidth: 2000, clientWidth: 1000, scrollLeft: 0 });
  act(() => { fireEvent.scroll(track); });
  expect(arrow("이전")).toHaveAttribute("hidden");
  const next = arrow("다음");
  expect(next).not.toHaveAttribute("hidden");
  track.scrollBy = vi.fn();
  fireEvent.click(next);
  expect(track.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 850 }));
  layout(track, { scrollWidth: 2000, clientWidth: 1000, scrollLeft: 1000 });
  act(() => { fireEvent.scroll(track); });
  expect(arrow("다음")).toHaveAttribute("hidden");
  expect(arrow("이전")).not.toHaveAttribute("hidden");
});

it("asks for more cards while the row does not run past its width", () => {
  const onNearEnd = vi.fn();
  render(<FanScrollRow locale="en" onNearEnd={onNearEnd}><li>a</li></FanScrollRow>);
  const track = screen.getByRole("list");
  layout(track, { scrollWidth: 400, clientWidth: 1000, scrollLeft: 0 });
  act(() => { fireEvent.scroll(track); });
  expect(onNearEnd).toHaveBeenCalled();
});

it("does not ask for more while far from the right end", () => {
  const onNearEnd = vi.fn();
  render(<FanScrollRow locale="en" onNearEnd={onNearEnd}><li>a</li></FanScrollRow>);
  onNearEnd.mockClear();
  const track = screen.getByRole("list");
  layout(track, { scrollWidth: 6000, clientWidth: 1000, scrollLeft: 0 });
  act(() => { fireEvent.scroll(track); });
  expect(onNearEnd).not.toHaveBeenCalled();
});
