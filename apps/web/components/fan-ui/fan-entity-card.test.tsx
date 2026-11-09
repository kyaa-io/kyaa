// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FanEntityCard } from "./fan-entity-card";

describe("FanEntityCard list row", () => {
  afterEach(cleanup);
  it("drops the fan-page tag, a zero fan count and the chevron", () => {
    const { container } = render(<FanEntityCard size="list" href="/a" image={{}} name="김민주" kind="fan" locale="ko" memberCount={0} />);
    expect(screen.getByRole("link").textContent).toBe("김민" + "김민주");
    expect(container.querySelector("svg")).toBeNull();
  });
  it("keeps the kind tag for brand and hobby pages and a non-zero count", () => {
    render(<FanEntityCard size="list" href="/a" image={{}} name="GGGI" kind="brand" locale="ko" memberCount={3} />);
    expect(screen.getByText("브랜드")).toBeTruthy();
    expect(screen.getByText("팬 3")).toBeTruthy();
  });
  it("card size keeps tag and chevron and leaves out a zero count (S4)", () => {
    const { container } = render(<FanEntityCard href="/a" image={{}} name="김민주" kind="fan" locale="ko" memberCount={0} />);
    expect(screen.getByText("팬페이지")).toBeTruthy();
    expect(screen.queryByText("팬 0")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("tile size: square photo tile with the name and one fact, the kind only for non-fan pages, no chevron", () => {
    const { container, rerender } = render(<FanEntityCard size="tile" href="/a" image={{}} name="RUN&MUSIC FESTIVAL" kind="brand" locale="ko" memberCount={13} />);
    expect(screen.getByRole("link").textContent).toBe("RU" + "RUN&MUSIC FESTIVAL" + "브랜드 · 팬 13");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-tile-media]")?.getAttribute("data-tile-media")).toBe("initials");
    rerender(<FanEntityCard size="tile" href="/a" image={{}} name="김민주" kind="fan" locale="ko" memberCount={0} />);
    expect(screen.getByRole("link").textContent).toBe("김민" + "김민주");
  });
});

