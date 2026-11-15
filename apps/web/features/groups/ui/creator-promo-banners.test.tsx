import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { creatorPromoBanners, pickCreatorPromoBanner } from "../domain/creator-promo-banners";
import { CreatorPromoBanners } from "./creator-promo-banners";

afterEach(cleanup);

it("keeps the seven banners in the fixed order 창하 → 엘리나 → 유나 → 히로로 → 민주 → 엔카이브 → 위나", () => {
  expect(creatorPromoBanners.map((banner) => banner.slug)).toEqual(["changha", "elina", "yuna", "hiroro", "mmnoo-s", "nchive", "wena"]);
});

it("picks the first of this week's hot pages that has a banner, else the first fixed one", () => {
  expect(pickCreatorPromoBanner(["someone-else", "wena", "elina"]).slug).toBe("wena");
  expect(pickCreatorPromoBanner(["nchive"]).slug).toBe("nchive");
  expect(pickCreatorPromoBanner([]).slug).toBe("changha");
  expect(pickCreatorPromoBanner().slug).toBe("changha");
  expect(pickCreatorPromoBanner(["someone-else"]).slug).toBe("changha");
});

it("gives every banner its picture's edge colors for the side fill", () => {
  for (const banner of creatorPromoBanners) {
    expect(banner.leftColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(banner.rightColor).toMatch(/^#[0-9a-f]{6}$/);
  }
  expect(creatorPromoBanners.find((banner) => banner.slug === "wena")).toMatchObject({ leftColor: "#fda8c7", rightColor: "#fda8c7" });
});

it("is a titled section with one picture-only link (this week's first) named by alt only, with the edge colors and no pager", () => {
  const { container } = render(<CreatorPromoBanners locale="ko" order={["mmnoo-s", "elina"]} />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "/mmnoo-s?locale=ko");
  expect(links[0]!.querySelector("img")).toHaveAttribute("alt", "민주");
  expect(links[0]).toHaveStyle({ "--promo-left": "#fdf3f9", "--promo-right": "#fdf3f9" });
  expect(links[0]!.textContent).toBe("");
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: "오늘의 팬페이지" })).toBeInTheDocument();
  expect(container.querySelectorAll("li,h1,h3,p")).toHaveLength(0);
});

it("titles the section in the current language", () => {
  render(<CreatorPromoBanners locale="en" order={["nchive"]} />);
  expect(screen.getByRole("heading", { level: 2, name: "Fan page of the day" })).toBeInTheDocument();
});

it("uses the English name for other locales and keeps the locale in the link", () => {
  render(<CreatorPromoBanners locale="en" order={["nchive"]} />);
  expect(screen.getByRole("link", { name: "NCHIVE" })).toHaveAttribute("href", "/nchive?locale=en");
  expect(screen.queryByRole("link", { name: "Changha" })).toBeNull();
});
