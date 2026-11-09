import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import type { BannerSlotMap, HomeBanner } from "@/features/home/domain/home-banner";

const slots = vi.hoisted(() => ({ value: {} as BannerSlotMap }));
vi.mock("@/components/banner-slot/banner-slot-source", () => ({ useBannerSlots: () => slots.value }));
import { HomeThinBanner } from "./home-thin-banner";

const asset = (w: number, h: number) => ({ id: "22222222-2222-4222-8222-222222222222", url: "/a.webp", width: w, height: h, mimeType: "image/webp", revision: 1 });
const banner = (extra: Partial<HomeBanner>): HomeBanner => ({ id: "11111111-1111-4111-8111-111111111111", kind: "announcement", celebrityId: null, title: "얇은 배너", description: "", ctaLabel: "보기", href: "/events", alt: "배너 그림",
  desktopImage: asset(2720, 240), mobileImage: asset(716, 180), ...extra });
afterEach(() => { cleanup(); slots.value = {}; });

it("draws nothing when the slot is empty (the only block that may leave)", () => {
  const { container } = render(<HomeThinBanner locale="ko" />);
  expect(container.firstChild).toBeNull();
});

it("draws one picture, no words over it, the whole strip as the link", () => {
  slots.value = { home_below_board: banner({}) };
  const { container } = render(<HomeThinBanner locale="ko" />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/events?locale=ko");
  expect(link.textContent).toBe("");
  expect(screen.getByAltText("배너 그림")).toHaveAttribute("src", "/a.webp");
  expect(container.querySelector("source")).toHaveAttribute("media", "(min-width: 64rem)");
});

it("marks an advertisement and opens an outside link in a new tab as sponsored", () => {
  slots.value = { home_below_board: banner({ category: "ad", href: "https://example.com/promo" }) };
  render(<HomeThinBanner locale="ko" />);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")).toContain("sponsored");
  expect(link).toHaveTextContent("광고");
});
