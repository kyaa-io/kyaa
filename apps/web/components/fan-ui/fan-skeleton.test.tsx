import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FanSkeletonPage, FanSkeletonRows } from "./fan-skeleton";
import { FanRouteSkeleton } from "./fan-route-skeleton";

describe("FanSkeletonPage", () => {
  it.each(["list", "detail", "form", "center"] as const)("%s layout is busy, announces once and hides the shapes", (layout) => {
    const { container } = render(<FanSkeletonPage locale="ko" layout={layout} />);
    expect(container.querySelector(`[data-fan-skeleton-page="${layout}"]`)).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("uses a custom status label", () => {
    render(<FanSkeletonPage locale="en" label="Loading settings" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading settings");
  });

  it("list layout draws six post rows", () => {
    const { container } = render(<FanSkeletonPage locale="ko" layout="list" />);
    expect(container.querySelectorAll('[data-fan-skeleton="post"] > div')).toHaveLength(6);
  });
});

describe("FanSkeletonRows", () => {
  it("names the busy group when a label is given", () => {
    render(<FanSkeletonRows rows={2} variant="entity" ariaLabel="Loading events" />);
    expect(screen.getByRole("status", { name: "Loading events" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("FanRouteSkeleton", () => {
  it("renders the page skeleton with the provider locale", () => {
    const { container } = render(<FanRouteSkeleton layout="form" />);
    expect(container.querySelector('[data-fan-skeleton-page="form"]')).not.toBeNull();
  });
});
