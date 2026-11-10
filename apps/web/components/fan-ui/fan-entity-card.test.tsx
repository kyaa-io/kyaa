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
  it("tile size: square photo and name without kind or count", () => {
    const { container, rerender } = render(<FanEntityCard size="tile" href="/a" image={{}} name="RUN&MUSIC FESTIVAL" kind="brand" locale="ko" memberCount={13} />);
    expect(screen.getByRole("link").textContent).toBe("RU" + "RUN&MUSIC FESTIVAL");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-tile-media]")?.getAttribute("data-tile-media")).toBe("initials");
    rerender(<FanEntityCard size="tile" href="/a" image={{}} name="김민주" kind="fan" locale="ko" memberCount={0} />);
    expect(screen.getByRole("link").textContent).toBe("김민" + "김민주");
  });
  it("keeps a non-public tile without a navigation link", () => {
    render(<FanEntityCard size="tile" href="/a" image={{}} name="비공개" kind="fan" locale="ko" disabled />);
    expect(screen.getByText("비공개")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("keeps the challenge badge inside the photo and hides tile fan counts", () => {
    const { container } = render(<FanEntityCard size="tile" href="/a" image={{}} name="엘리나" kind="fan" locale="ko" memberCount={126} badge={<span>찐팬 100</span>} />);
    expect(container.querySelector("[data-tile-media]")).toHaveTextContent("찐팬 100");
    expect(screen.queryByText("팬 126")).toBeNull();
    expect(screen.getByRole("link", { name: /엘리나/ })).toBeTruthy();
  });
  it("tile size: a brand page linked to a creator record shows its own logo whole, a fan page shows the creator crop", () => {
    const { container, rerender } = render(<FanEntityCard size="tile" href="/a" image={{ slug: "gggi", src: "/images/gggi/logo-green.png" }} name="GGGI" kind="brand" locale="ko" memberCount={3} />);
    expect(container.querySelector("[data-tile-media]")?.getAttribute("data-tile-media")).toBe("page");
    rerender(<FanEntityCard size="tile" href="/a" image={{ slug: "elina", src: "/images/guest-home/elina-card.jpg" }} name="엘리나" kind="fan" locale="ko" memberCount={3} />);
    expect(container.querySelector("[data-tile-media]")?.getAttribute("data-tile-media")).toBe("creator");
  });
});

