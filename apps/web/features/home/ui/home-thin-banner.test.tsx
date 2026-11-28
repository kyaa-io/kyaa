import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import type { HomeBanner } from "@/features/home/domain/home-banner";

import { PD_SHORTS_BANNER_ID } from "@/features/home/domain/pd-shorts-banner";

import { recordLinkClick } from "@/features/analytics/client/record-link-click";
import { ThinBanner } from "./home-thin-banner";

vi.mock("@/features/analytics/client/record-link-click", () => ({ recordLinkClick: vi.fn() }));

const asset = (w: number, h: number) => ({ id: "22222222-2222-4222-8222-222222222222", url: "/a.webp", width: w, height: h, mimeType: "image/webp", revision: 1 });
const banner = (extra: Partial<HomeBanner>): HomeBanner => ({ id: "11111111-1111-4111-8111-111111111111", kind: "announcement", celebrityId: null, title: "얇은 배너", description: "", ctaLabel: "보기", href: "/events", alt: "배너 그림",
  desktopImage: asset(2720, 240), mobileImage: asset(716, 180), ...extra });
afterEach(cleanup);

it("draws one picture, no words over it, the whole strip as the link, with no frame or fill of its own", () => {
  const { container } = render(<ThinBanner banner={banner({})} locale="ko" />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/events?locale=ko");
  expect(link.textContent).toBe("");
  expect(screen.getByAltText("배너 그림")).toHaveAttribute("src", "/a.webp");
  expect(container.querySelector("source")).toHaveAttribute("media", "(min-width: 64rem)");
});

it("marks an advertisement and opens an outside link in a new tab as sponsored", () => {
  render(<ThinBanner banner={banner({ category: "ad", href: "https://example.com/promo" })} locale="ko" />);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")).toContain("sponsored");
  expect(link).toHaveTextContent("광고");
});

it("draws the mid size with the phone artwork under 768 and the wide artwork from 768", () => {
  const mid = { desktopImage: asset(2720, 480), mobileImage: asset(716, 320) };
  const plain = render(<ThinBanner banner={banner(mid)} locale="ko" size="mid" />);
  expect(plain.container.querySelector("[data-home-thin-banner]")).toHaveAttribute("data-banner-size", "mid");
  expect(plain.container.querySelector("source")).toHaveAttribute("media", "(min-width: 48rem)");
  expect(plain.container.querySelector("img")).toHaveAttribute("width", "716");
});

it("draws the side size with only the PC artwork, loaded from 1280px", () => {
  const { container } = render(<ThinBanner banner={banner({ desktopImage: asset(720, 1200), mobileImage: asset(716, 320) })} locale="ko" size="side" />);
  expect(container.querySelector("[data-home-thin-banner]")).toHaveAttribute("data-banner-size", "side");
  expect(container.querySelector("source")).toHaveAttribute("media", "(min-width: 80rem)");
  expect(container.querySelector("source")).toHaveAttribute("srcset", "/a.webp");
  expect(container.querySelector("img")).not.toHaveAttribute("src");
  expect(container.querySelector("img")).toHaveAttribute("width", "720");
  expect(container.querySelector("img")).toHaveAttribute("height", "1200");
  expect(screen.getByRole("link").getAttribute("href")).toBe("/events?locale=ko");
});

it.each(["https://x.com/kyaa_app/status/2122644458340745250", "/assets/shorts.mp4"])(
  "opens the Korean notice from the sidebar when the banner stores %s",
  href => {
    render(<ThinBanner banner={banner({ id: PD_SHORTS_BANNER_ID, href })} locale="ko" size="sidebar-ad" sponsored />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/notices/kyaa-wave-na-pd-video-1117?locale=ko");
    expect(link).toHaveTextContent("영상 보고 댓글 남기기");
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("data-outbound-kind");
    vi.mocked(recordLinkClick).mockClear();
    fireEvent.click(link, { ctrlKey: true });
    fireEvent(link, new MouseEvent("auxclick", { button: 1, bubbles: true }));
    expect(recordLinkClick).toHaveBeenCalledTimes(2);
    expect(recordLinkClick).toHaveBeenCalledWith({
      destinationHost: "kyaa.io", campaign: "groups", placement: "content", linkKind: "website",
    }, PD_SHORTS_BANNER_ID);
  },
);
