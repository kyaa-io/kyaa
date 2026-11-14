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

it("is one picture-only link to that fan page with the current locale, named by alt only, with no pager", () => {
  const { container } = render(<CreatorPromoBanners locale="ko" order={["mmnoo-s", "elina"]} />);
  const link = screen.getByRole("link");
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(link).toHaveAttribute("href", "/mmnoo-s?locale=ko");
  expect(link.querySelector("img")).toHaveAttribute("alt", "민주");
  expect(link.textContent).toBe("");
  expect(screen.queryByRole("button")).toBeNull();
  expect(container.querySelectorAll("li,h1,h2,h3,p")).toHaveLength(0);
});

it("uses the English name for other locales and keeps the locale in the link", () => {
  render(<CreatorPromoBanners locale="en" order={["nchive"]} />);
  expect(screen.getByRole("link", { name: "NCHIVE" })).toHaveAttribute("href", "/nchive?locale=en");
});
