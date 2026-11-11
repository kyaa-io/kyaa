import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ state: { status: "loading" } as unknown, url: "" }));
vi.mock("./use-ranking-resource", () => ({ useRankingResource: (url: string) => { h.url = url; return { state: h.state, retry: vi.fn() }; } }));
vi.mock("./jjinfan-gauge", () => ({ JjinfanGauge: ({ slug }: { slug: string }) => <section data-testid="gauge" data-slug={slug} /> }));
import { HomeJjinfanStrip } from "./home-jjinfan-strip";
import { JjinfanChallengeDetail } from "./jjinfan-detail";

afterEach(cleanup);
const item = (slug: string, count: number) => ({ slug, name: slug === "elina" ? "엘리나" : slug, imageUrl: null, title: "제목", description: "", endsOn: null, count, target: 100 as const });

it("shows nothing for no challenge or a failed read, and a skeleton while reading", () => {
  for (const state of [{ status: "error" }, { status: "ready", data: { items: [] } }]) {
    h.state = state;
    const { container } = render(<HomeJjinfanStrip locale="ko" />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  }
  h.state = { status: "loading" };
  const { container } = render(<HomeJjinfanStrip locale="ko" />);
  expect(container.querySelector("[data-skeleton]")).not.toBeNull();
});

it("shows only the first challenge: count/100, a meter, the donation line, and links to the detail page", () => {
  h.state = { status: "ready", data: { items: [item("elina", 37), item("wena", 90)] } };
  const { container } = render(<HomeJjinfanStrip locale="ko" />);
  expect(h.url).toBe("/api/rankings/challenges?locale=ko");
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", "/guide/jjinfan?locale=ko#jjinfan-challenge");
  expect(link.textContent).toContain("37/100");
  expect(link.textContent).toContain("하트 100개가 모이면 1개당 1,000원을 기부해요");
  expect(screen.getAllByRole("meter")).toHaveLength(1);
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "37");
  expect(container.querySelector('[data-end="live"]')).not.toBeNull();
});

it("clamps a count over 100, drops the blinking end at 100, and starts at 0", () => {
  h.state = { status: "ready", data: { items: [item("elina", 130)] } };
  const { container, rerender } = render(<HomeJjinfanStrip locale="ko" />);
  expect(screen.getByRole("link").textContent).toContain("100/100");
  expect(container.querySelector('[data-end="live"]')).toBeNull();
  h.state = { status: "ready", data: { items: [item("elina", 0)] } };
  rerender(<HomeJjinfanStrip locale="ko" />);
  expect(screen.getByRole("link").textContent).toContain("0/100");
});

it("the detail section holds the gauge of the first challenge, the donation line and the two pending places", () => {
  h.state = { status: "ready", data: { items: [item("elina", 37)] } };
  const { container } = render(<JjinfanChallengeDetail locale="ko" />);
  expect(screen.getByTestId("gauge")).toHaveAttribute("data-slug", "elina");
  expect(container.querySelector('[data-pending="donation"]')?.textContent).toBe("기부처는 확정 후 안내해요");
  expect(container.querySelector('[data-pending="names"]')).not.toBeNull();
  expect(screen.getByRole("link", { name: "응원하러 가기" })).toHaveAttribute("href", "/elina?tab=members&locale=ko");
  cleanup();
  h.state = { status: "ready", data: { items: [] } };
  expect(render(<JjinfanChallengeDetail locale="ko" />).container).toBeEmptyDOMElement();
});
