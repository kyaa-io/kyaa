import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { creatorPromoBanners } from "../domain/creator-promo-banners";
import { CreatorPromoBanners } from "./creator-promo-banners";

afterEach(cleanup);

it("fixes the order 창하 → 엘리나 → 유나 → 히로로 → 민주 → 엔카이브 → 위나", () => {
  expect(creatorPromoBanners.map((banner) => banner.slug)).toEqual(["changha", "elina", "yuna", "hiroro", "mmnoo-s", "nchive", "wena"]);
});

it("is seven picture-only links to each fan page with the current locale, named by alt only", () => {
  const { container } = render(<CreatorPromoBanners locale="ko" />);
  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual(creatorPromoBanners.map((banner) => `/${banner.slug}?locale=ko`));
  expect(links.map((link) => link.querySelector("img")?.getAttribute("alt"))).toEqual(["창하", "엘리나", "유나", "히로로", "민주", "엔카이브", "위나"]);
  links.forEach((link) => expect(link.textContent).toBe(""));
  expect(container.querySelectorAll("h1,h2,h3,p")).toHaveLength(0);
});

it("uses the English names for other locales and keeps the locale in the link", () => {
  render(<CreatorPromoBanners locale="en" />);
  expect(screen.getByRole("link", { name: "Changha" })).toHaveAttribute("href", "/changha?locale=en");
  expect(screen.getByRole("link", { name: "NCHIVE" })).toHaveAttribute("href", "/nchive?locale=en");
});
