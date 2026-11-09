import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { bannerFixture } from "../../e2e/banner-local/fixture";
import { ManagedHomeBanner } from "./managed-home-banner";
import styles from "./managed-home-banner.module.css";
import heroStyles from "./home-hero-banner.module.css";

const css = readFileSync("components/home-entry-cards/managed-home-banner.module.css", "utf8");
afterEach(cleanup);

describe("home banner artwork fit", () => {
  it.each([
    { category: "guide" as const, kind: "art", fit: "contain", guide: true },
    { category: "event" as const, kind: "live", fit: "cover", guide: false },
  ])("renders $category artwork in its $fit slot", ({ category, kind, fit, guide }) => {
    const { container } = render(<ManagedHomeBanner banner={{ ...bannerFixture, category }} locale="ko" />);
    const root = container.querySelector("[data-managed-home-banner]")!;
    const hero = root.querySelector("[data-home-hero-banner]")!;
    const picture = hero.querySelector(`.${heroStyles.fullImage} picture.${styles.artwork}`)!;
    expect(root.hasAttribute("data-guide-art")).toBe(guide);
    expect(hero).toHaveAttribute("data-kind", kind);
    expect(picture).toBeInTheDocument();
    expect(picture.querySelector("img")).toBeInTheDocument();
    // Check the CSS rule that actually selects this rendered image, including the guide override.
    const selector = guide ? "[data-guide-art] .artwork img" : ".artwork img";
    const rule = css.split("}").find((part) => part.includes(selector) && part.includes(`object-fit:${fit}`));
    expect(rule).toBeDefined();
    expect(picture.querySelector("img")!.matches(guide ? `[data-guide-art] .${styles.artwork} img` : `.${styles.artwork} img`)).toBe(true);
  });
});
