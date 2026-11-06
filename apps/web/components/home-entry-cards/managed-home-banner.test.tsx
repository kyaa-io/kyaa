import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { bannerFixture } from "../../e2e/banner-local/fixture";
import { homeBannerSchema } from "../../features/home/domain/home-banner";
import { ManagedHomeBanner } from "./managed-home-banner";

vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a> }));

const guide = (overrides: Record<string, unknown> = {}) => homeBannerSchema.parse({ ...bannerFixture, category: "guide", href: "/guide/jjinfan", title: "찐팬 되는 법", ...overrides });

describe("managed home banner", () => {
  it("lays a guide banner out as art with the copy on its empty side, decided by the row's category", () => {
    const { container } = render(<ManagedHomeBanner banner={guide()} locale="ko" />);
    expect(container.querySelector("[data-managed-home-banner]")).toHaveAttribute("data-guide-art", "true");
    expect(container.querySelector('[data-home-hero-banner][data-kind="art"]')).not.toBeNull();
    expect(container.querySelector("h2")).toHaveTextContent("찐팬 되는 법");
  });
  it("keeps other banners on the live layout", () => {
    const { container } = render(<ManagedHomeBanner banner={guide({ category: "announcement" })} locale="ko" />);
    expect(container.querySelector("[data-guide-art]")).toBeNull();
    expect(container.querySelector('[data-home-hero-banner][data-kind="live"]')).not.toBeNull();
  });
});
