import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ state: { status: "loading" } as unknown, url: "" }));
vi.mock("./use-ranking-resource", () => ({ useRankingResource: (url: string) => { h.url = url; return { state: h.state, retry: vi.fn() }; } }));
import { HomeJjinfanStrip } from "./home-jjinfan-strip";
import { JjinfanChallengeDetail } from "./jjinfan-detail";

afterEach(cleanup);
// `count` is the number of 찐팬 (fans holding a heart); the gauge reads `hearts`, the total of hearts (대표 2026-11-11).
const item = (slug: string, count: number, hearts: number) => ({ slug, name: slug === "elina" ? "엘리나" : slug, imageUrl: null, title: "제목", description: "", endsOn: null, count, hearts, target: 100 as const });

it("shows a skeleton while reading", () => {
  h.state = { status: "loading" };
  const { container } = render(<HomeJjinfanStrip locale="ko" />);
  expect(container.querySelector("[data-skeleton]")).not.toBeNull();
});

it("reads 0 honestly for no challenge or a failed read, and still links to the detail page (no blank band)", () => {
  for (const state of [{ status: "error" }, { status: "ready", data: { items: [] } }]) {
    h.state = state;
    render(<HomeJjinfanStrip locale="ko" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/guide/jjinfan?locale=ko#jjinfan-challenge");
    expect(screen.getByRole("link").textContent).toContain("0/100");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    cleanup();
  }
});

it("fills by hearts, not fans: the first challenge's hearts over 100 with the donation line", () => {
  h.state = { status: "ready", data: { items: [item("elina", 5, 37), item("wena", 90, 90)] } };
  const { container } = render(<HomeJjinfanStrip locale="ko" />);
  expect(h.url).toBe("/api/rankings/challenges?locale=ko");
  const link = screen.getByRole("link");
  expect(link.textContent).toContain("37/100");
  expect(link.textContent).not.toContain("5/100");
  expect(link.textContent).toContain("하트 100개가 모이면 1개당 1,000원을 기부해요");
  expect(screen.getAllByRole("meter")).toHaveLength(1);
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "37");
  expect(container.querySelector('[data-end="live"]')).not.toBeNull();
});

it("clamps hearts over 100 and drops the blinking end at 100", () => {
  h.state = { status: "ready", data: { items: [item("elina", 40, 130)] } };
  const { container } = render(<HomeJjinfanStrip locale="ko" />);
  expect(screen.getByRole("link").textContent).toContain("100/100");
  expect(container.querySelector('[data-end="live"]')).toBeNull();
});

it("the detail section reads the hearts of the first challenge, the donation line and the two pending places", () => {
  h.state = { status: "ready", data: { items: [item("elina", 5, 37)] } };
  const { container } = render(<JjinfanChallengeDetail locale="ko" />);
  expect(container.querySelector("[data-jjinfan-gauge]")?.textContent).toContain("37/100");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
  expect(container.querySelector('[data-pending="donation"]')?.textContent).toBe("기부처는 확정 후 안내해요");
  expect(container.querySelector('[data-pending="names"]')).not.toBeNull();
  expect(screen.getByRole("link", { name: "응원하러 가기" })).toHaveAttribute("href", "/elina?tab=members&locale=ko");
});

it("the detail section reads 0 with no cheer button when nothing is on or the read failed", () => {
  for (const state of [{ status: "error" }, { status: "ready", data: { items: [] } }]) {
    h.state = state;
    const { container } = render(<JjinfanChallengeDetail locale="ko" />);
    expect(container.querySelector("[data-jjinfan-gauge]")?.textContent).toContain("0/100");
    expect(screen.queryByRole("link", { name: "응원하러 가기" })).toBeNull();
    cleanup();
  }
});
