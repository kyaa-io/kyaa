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
  it("card size is unchanged: tag, count and chevron", () => {
    const { container } = render(<FanEntityCard href="/a" image={{}} name="김민주" kind="fan" locale="ko" memberCount={0} />);
    expect(screen.getByText("팬페이지")).toBeTruthy();
    expect(screen.getByText("팬 0")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
