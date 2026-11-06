import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ state: { status: "loading" } as unknown, url: "" }));
vi.mock("./use-ranking-resource", () => ({ useRankingResource: (url: string) => { h.url = url; return { state: h.state, retry: vi.fn() }; } }));
import { jjinfanChallengeSchema } from "../domain/types";
import { JjinfanGauge } from "./jjinfan-gauge";

afterEach(cleanup);
const ready = (data: unknown) => { h.state = { status: "ready", data }; };

it("renders nothing while loading, on failure, and for a creator that is not taking part", () => {
  for (const state of [{ status: "loading" }, { status: "error" }, { status: "ready", data: { count: 3, target: 100, campaign: null } }, { status: "ready", data: { count: 3, target: 100 } }]) {
    h.state = state;
    const { container } = render(<JjinfanGauge slug="elina" locale="ko" />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  }
});
it("shows the administrator's words with the live count against the fixed target", () => {
  ready({ count: 78, target: 100, campaign: { title: "운영자 제목", description: "운영자 설명" } });
  render(<JjinfanGauge slug="elina" locale="ko" />);
  expect(h.url).toBe("/api/pages/elina/jjinfan-challenge");
  expect(screen.getByRole("heading", { name: "운영자 제목" })).toBeInTheDocument();
  expect(screen.getByText("운영자 설명")).toBeInTheDocument();
  expect(screen.getByText("78 / 100명")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "78");
});
it("caps the bar past the target and omits an empty description", () => {
  ready({ count: 104, target: 100, campaign: { title: "제목", description: "" } });
  const { container } = render(<JjinfanGauge slug="elina" locale="ko" />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(container.querySelector("[role=progressbar] i")).toHaveStyle({ width: "100%" });
  expect(container.querySelectorAll("p").length).toBe(1);
});
it("accepts both the old and the new database answer", () => {
  expect(jjinfanChallengeSchema.parse({ count: 1, target: 100 }).campaign).toBeUndefined();
  expect(jjinfanChallengeSchema.parse({ count: 1, target: 100, campaign: null }).campaign).toBeNull();
  expect(jjinfanChallengeSchema.parse({ count: 1, target: 100, campaign: { title: "t", description: "" } }).campaign?.title).toBe("t");
});
