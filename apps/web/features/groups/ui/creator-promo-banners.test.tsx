import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { creatorPromoBanners, pickCreatorPromoBanner, pickNextCreatorPromoBanner } from "../domain/creator-promo-banners";
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

it("picks the next banner by the same rank and never repeats the first", () => {
  expect(pickNextCreatorPromoBanner(["mmnoo-s", "elina"]).slug).toBe("elina");
  expect(pickNextCreatorPromoBanner(["someone-else", "wena", "elina"]).slug).toBe("elina");
  expect(pickNextCreatorPromoBanner(["nchive"]).slug).toBe("changha");
  expect(pickNextCreatorPromoBanner(["changha"]).slug).toBe("elina");
  expect(pickNextCreatorPromoBanner(["wena", "wena"]).slug).toBe("changha");
  expect(pickNextCreatorPromoBanner([]).slug).toBe("elina");
  expect(pickNextCreatorPromoBanner().slug).toBe("elina");
});

it("is a titled section with two picture-only links (this week's first, then the next) named by alt only, with no pager", () => {
  const { container } = render(<CreatorPromoBanners locale="ko" order={["mmnoo-s", "elina"]} />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute("href", "/mmnoo-s?locale=ko");
  expect(links[1]).toHaveAttribute("href", "/elina?locale=ko");
  expect(links[0]!.querySelector("img")).toHaveAttribute("alt", "민주");
  expect(links[1]!.querySelector("img")).toHaveAttribute("alt", "엘리나");
  expect(links[0]).toHaveAttribute("data-side", "first");
  expect(links[1]).toHaveAttribute("data-side", "second");
  expect(links.map((link) => link.textContent)).toEqual(["", ""]);
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
  expect(screen.getByRole("link", { name: "Changha" })).toHaveAttribute("href", "/changha?locale=en");
});
