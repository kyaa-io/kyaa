import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import type { HomeBanner } from "@/features/home/domain/home-banner";

import { ThinBanner } from "./home-thin-banner";

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

it("draws the side size as one picture of the PC artwork, with no phone artwork and no source switch", () => {
  const { container } = render(<ThinBanner banner={banner({ desktopImage: asset(720, 1200), mobileImage: asset(716, 320) })} locale="ko" size="side" />);
  expect(container.querySelector("[data-home-thin-banner]")).toHaveAttribute("data-banner-size", "side");
  expect(container.querySelector("source")).toBeNull();
  expect(container.querySelector("img")).toHaveAttribute("width", "720");
  expect(container.querySelector("img")).toHaveAttribute("height", "1200");
  expect(screen.getByRole("link").getAttribute("href")).toBe("/events?locale=ko");
});
