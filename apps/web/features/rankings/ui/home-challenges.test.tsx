import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ state: { status: "loading" } as unknown, url: "" }));
vi.mock("./use-ranking-resource", () => ({ useRankingResource: (url: string) => { h.url = url; return { state: h.state, retry: vi.fn() }; } }));
import { HomeChallenges, pickHomeChallenges } from "./home-challenges";

afterEach(cleanup);
const item = (slug: string, count: number) => ({ slug, name: slug === "elina" ? "엘리나" : slug, imageUrl: null, title: "제목", description: "", endsOn: null, count, target: 100 as const });

it("keeps the viewer's own page first, then the closest to 100, two at most", () => {
  const items = [item("a", 10), item("b", 90), item("elina", 5), item("c", 50)];
  expect(pickHomeChallenges(items, new Set()).map((x) => x.slug)).toEqual(["b", "c"]);
  expect(pickHomeChallenges(items, new Set(["elina"])).map((x) => x.slug)).toEqual(["elina", "b"]);
});

it("has no module for none or a failed read, and keeps two skeleton rows while reading", () => {
  for (const state of [{ status: "error" }, { status: "ready", data: { items: [] } }]) {
    h.state = state;
    const { container } = render(<HomeChallenges locale="ko" />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  }
  h.state = { status: "loading" };
  const { container } = render(<HomeChallenges locale="ko" />);
  expect(container.querySelectorAll("li[aria-hidden=true]")).toHaveLength(2);
});

it("lists each challenge with its gauge and sends the cheer link to the first fan page's fans tab", () => {
  h.state = { status: "ready", data: { items: [item("elina", 67), item("wena", 31)] } };
  render(<HomeChallenges locale="ko" />);
  expect(h.url).toBe("/api/rankings/challenges?locale=ko");
  expect(screen.getByRole("heading", { name: "찐팬 100 챌린지" })).toBeInTheDocument();
  const elina = screen.getByRole("link", { name: /엘리나/ });
  expect(elina).toHaveAttribute("href", "/elina?tab=members&locale=ko");
  expect(within(elina).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
  expect(elina.textContent).toContain("67 / 100명");
  expect(screen.getByRole("link", { name: "응원하러 가기" })).toHaveAttribute("href", "/elina?tab=members&locale=ko");
});
