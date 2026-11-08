import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { bannerFixture } from "../../e2e/banner-local/fixture";
import { homeBannerSchema } from "../../features/home/domain/home-banner";
import { renderToString } from "react-dom/server";
import { gggiHomeBanner } from "../../features/home/domain/gggi-home-banner";
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
  it("PERF-r5: the first slide hints its image from the head with the <picture>'s media, and the campaign art is sized to its 46% column", () => {
    const html = renderToString(<ManagedHomeBanner banner={gggiHomeBanner("ko")} locale="ko" priority />);
    const hints = [...html.matchAll(/<link rel="preload"[^>]*>/g)].map(match => match[0]);
    // One asset (no mobile original): one hint without media, its sizes covering every width.
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('as="image"'); expect(hints[0]).toContain('fetchPriority="high"'); expect(hints[0]).toContain("gggi-20261030.jpg"); expect(hints[0]).not.toContain("media=");
    const twoAssets = renderToString(<ManagedHomeBanner banner={guide({ category: "announcement", mobileImage: { ...bannerFixture.desktopImage, id: "99999999-0000-4000-8000-000000000001", url: "/images/groups/nchive-group.webp" } })} locale="ko" priority />);
    const media = [...twoAssets.matchAll(/<link rel="preload"[^>]*media="([^"]*)"/g)].map(match => match[1]);
    expect(media).toEqual(["(min-width: 768px)", "(max-width: 767px)"]);
    expect(html).toContain("(min-width: 1440px) 438px");
    expect(renderToString(<ManagedHomeBanner banner={gggiHomeBanner("ko")} locale="ko" />)).not.toContain('rel="preload"');
  });
});
