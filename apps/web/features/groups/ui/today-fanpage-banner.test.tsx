import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import type { TodayFanpage } from "../domain/today-fanpage";
import { TodayFanpageBanner } from "./today-fanpage-banner";

afterEach(cleanup);
const item = (slug: string, name: string, over: Partial<TodayFanpage> = {}): TodayFanpage => ({ slug, name, imageUrl: null, periodDays: 30, score: 10, posts: 3, comments: 0, likes: 12, missions: 0, fans: 5, ...over });

it("renders nothing when there is no fan page of the day", () => {
  const { container } = render(<TodayFanpageBanner items={[]} locale="ko" />);
  expect(container).toBeEmptyDOMElement();
});

it("one item: the whole card links to the fan page, no pager, zero stats are left out", () => {
  render(<TodayFanpageBanner items={[item("elina", "엘리나")]} locale="ko" />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/elina?locale=ko");
  expect(screen.getByText("최근 30일 · 팬 5명 참여")).toBeInTheDocument();
  expect(screen.queryByText("댓글")).toBeNull();
  expect(screen.queryByText("미션")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

it("three items page with ‹ 1/3 › and wrap around; the period is omitted for the all-time window", () => {
  render(<TodayFanpageBanner items={[item("a", "에이"), item("b", "비", { periodDays: null }), item("c", "씨")]} locale="ko" />);
  expect(screen.getByText("1/3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음 팬페이지" }));
  expect(screen.getByRole("link")).toHaveAttribute("href", "/b?locale=ko");
  expect(screen.getByText("팬 5명 참여")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전 팬페이지" }));
  fireEvent.click(screen.getByRole("button", { name: "이전 팬페이지" }));
  expect(screen.getByRole("link")).toHaveAttribute("href", "/c?locale=ko");
});
