import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { bannerFixture } from "../../e2e/banner-local/fixture";
import { homeBannerSchema } from "../../features/home/domain/home-banner";
import { renderToString } from "react-dom/server";
import { gggiHomeBanner } from "../../features/home/domain/gggi-home-banner";
import { missionbookHomeBanner } from "../../features/home/domain/missionbook-home-banner";
import { xMissionHomeBanner } from "../../features/home/domain/x-mission-home-banner";
import { ManagedHomeBanner } from "./managed-home-banner";

vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { reaction: null, likeCount: 340, dislikeCount: null, commentCount: 0 } }, retry: vi.fn() }) }));

const guide = (overrides: Record<string, unknown> = {}) => homeBannerSchema.parse({ ...bannerFixture, category: "guide", href: "/guide/jjinfan", title: "찐팬 되는 법", ...overrides });

describe("managed home banner", () => {
  it("lays a guide banner out as art with the copy on its empty side, decided by the row's category", () => {
    const { container } = render(<ManagedHomeBanner banner={guide()} locale="ko" />);
    expect(container.querySelector("[data-managed-home-banner]")).toHaveAttribute("data-guide-art", "true");
    expect(container.querySelector('[data-home-hero-banner][data-kind="art"]')).not.toBeNull();
    expect(container.querySelector("h2")).toHaveTextContent("찐팬 되는 법");
  });
  it("shows the mission book like count (real + 10) between the title and the action, and only on that banner", () => {
    const { container } = render(<ManagedHomeBanner banner={missionbookHomeBanner("ko")} locale="ko" />);
    expect(container.querySelector("[data-missionbook]")).not.toBeNull();
    expect(container.querySelector('[data-missionbook-likes][data-tone="banner"]')).toHaveTextContent("좋아요 350명");
    expect(render(<ManagedHomeBanner banner={guide()} locale="ko" />).container.querySelector("[data-missionbook-likes]")).toBeNull();
  });
  it("marks an admin 'event' banner with the one-day tag and the time left, and no code-pinned event banner", () => {
    const { container } = render(<ManagedHomeBanner banner={guide({ category: "event", href: "/yuna", title: "유나 × Kyaa" })} locale="ko" />);
    const eyebrow = container.querySelector("[data-event-day-eyebrow]");
    expect(eyebrow).toHaveTextContent("오늘 하루 이벤트");
    expect(eyebrow?.querySelector("[data-fan-tag]")).not.toBeNull();
    expect(render(<ManagedHomeBanner banner={xMissionHomeBanner("ko")} locale="ko" />).container.querySelector("[data-event-day-eyebrow]")).toBeNull();
    expect(render(<ManagedHomeBanner banner={guide({ category: "announcement" })} locale="ko" />).container.querySelector("[data-event-day-eyebrow]")).toBeNull();
  });
  it("lays the banner's muted loops over the still, one per width, and none on a banner without video", () => {
    const { container } = render(<ManagedHomeBanner banner={missionbookHomeBanner("ko")} locale="ko" />);
    const layers = [...container.querySelectorAll("[data-hero-full-image] [data-banner-video]")];
    expect(layers.map(layer => layer.getAttribute("data-banner-video"))).toEqual(["desktop", "mobile"]);
    for (const video of container.querySelectorAll("video")) {
      expect(video.muted).toBe(true); expect(video).toHaveAttribute("playsinline"); expect(video).toHaveAttribute("preload", "none"); expect(video).toHaveAttribute("aria-hidden", "true");
    }
    expect(container.querySelector("[data-hero-full-image] picture img")).not.toBeNull();
    expect(render(<ManagedHomeBanner banner={xMissionHomeBanner("ko")} locale="ko" />).container.querySelector('[data-hero-full-image] [data-banner-video="all"]')).not.toBeNull();
    expect(render(<ManagedHomeBanner banner={guide()} locale="ko" />).container.querySelector("video")).toBeNull();
  });
  it("heads an outside ad banner with the ad label, not the kyaa news label", () => {
    const eyebrow = (category: string, locale: "ko" | "en" | "ja") => render(<ManagedHomeBanner banner={guide({ category, kind: "announcement", href: "/yuna" })} locale={locale} />).container.querySelector("[class*=eyebrow]");
    expect(eyebrow("ad", "ko")).toHaveTextContent(/^광고$/);
    expect(eyebrow("ad", "en")).toHaveTextContent(/^Ad$/);
    expect(eyebrow("ad", "ja")).toHaveTextContent(/^広告$/);
    expect(eyebrow("announcement", "ko")).toHaveTextContent(/^kyaa 소식$/);
  });
  it("keeps other banners on the live layout", () => {
    const { container } = render(<ManagedHomeBanner banner={guide({ category: "announcement" })} locale="ko" />);
    expect(container.querySelector("[data-guide-art]")).toBeNull();
    expect(container.querySelector('[data-home-hero-banner][data-kind="live"]')).not.toBeNull();
  });
  it("PERF-r5: the first slide hints its image from the head with the <picture>'s media, and the campaign art is sized to the banner picture slot", () => {
    const html = renderToString(<ManagedHomeBanner banner={gggiHomeBanner("ko")} locale="ko" priority />);
    const hints = [...html.matchAll(/<link rel="preload"[^>]*>/g)].map(match => match[0]);
    // One asset (no mobile original): one hint without media, its sizes covering every width.
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('as="image"'); expect(hints[0]).toContain('fetchPriority="high"'); expect(hints[0]).toContain("changha-autumn-banner-20261113.webp"); expect(hints[0]).not.toContain("media=");
    const twoAssets = renderToString(<ManagedHomeBanner banner={guide({ category: "announcement", mobileImage: { ...bannerFixture.desktopImage, id: "99999999-0000-4000-8000-000000000001", url: "/images/groups/nchive-group.webp" } })} locale="ko" priority />);
    const media = [...twoAssets.matchAll(/<link rel="preload"[^>]*media="([^"]*)"/g)].map(match => match[1]);
    expect(media).toEqual(["(min-width: 768px)", "(max-width: 767px)"]);
    expect(html).toContain("(min-width: 1440px) 572px");
    expect(renderToString(<ManagedHomeBanner banner={gggiHomeBanner("ko")} locale="ko" />)).not.toContain('rel="preload"');
  });
});
