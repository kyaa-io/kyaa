import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "components/guest-home.module.css"),
  "utf8",
);
const heroCarouselSource = readFileSync(
  resolve(process.cwd(), "components/live-hero-carousel.tsx"),
  "utf8",
);
const liveStatusCss = readFileSync(
  resolve(process.cwd(), "components/live-status-indicator.module.css"),
  "utf8",
);

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!match) throw new Error(`Missing CSS selector: ${selector}`);
  return match[1].replace(/\s+/g, " ");
}

describe("guest home compact icon-only action spacing", () => {
  it("keeps adjacent header and social action targets edge-to-edge", () => {
    expect(declarationBlock(".headerActions")).toMatch(/\bgap:\s*0\b/);
    expect(declarationBlock(".socialLinks")).toMatch(/\bgap:\s*0\b/);
  });

  it("keeps social actions accessible while using one 20px ink for every brand mark", () => {
    const target = declarationBlock(".socialLink");
    const icon = declarationBlock(".socialIcon");
    const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(globals).toMatch(/--min-target:\s*44px/);
    expect(globals).toMatch(/--fan-icon-size:\s*20px/);
    expect(target).toMatch(/\bwidth:\s*var\(--min-target\)/);
    expect(target).toMatch(/\bheight:\s*var\(--min-target\)/);
    expect(target).toContain("color: var(--muted)");
    expect(icon).toMatch(/\bwidth:\s*var\(--fan-icon-size\)/);
    expect(icon).toMatch(/\bheight:\s*var\(--fan-icon-size\)/);
    expect(icon).toContain("background: currentColor");
    expect(declarationBlock(".celebrityFanLink svg")).toMatch(/width:\s*var\(--fan-icon-size\)/);
  });

  it("keeps identity readable and actions in their own wrapping row", () => {
    expect(declarationBlock(".celebrityInfo h3")).toContain("var(--fan-item-title-size)");
    expect(declarationBlock(".celebrityInfo h3")).not.toContain("nowrap");
    expect(declarationBlock(".celebrityActions")).toContain("flex-wrap: wrap");
    expect(declarationBlock(".celebrityFanLink")).toMatch(/min-height:\s*var\(--min-target\)/);
    expect(declarationBlock(".fanCount")).toContain("var(--muted)");
    expect(liveStatusCss).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the hero status outline visible without adding a filled surface", () => {
    const status = declarationBlock(".liveStatus");

    expect(status).toMatch(
      /\bborder:\s*1px\s+solid\s+rgb\(255\s+95\s+191\s*\/\s*92%\)/,
    );
    expect(status).not.toMatch(/\bbackground(?:-color)?:/);
  });

  it("uses a quieter hierarchy in the signed-in Passport summary", () => {
    expect(declarationBlock(".signedInGreeting h2")).toMatch(
      /\bfont-weight:\s*800\b/,
    );
    expect(declarationBlock(".summarySectionHeader > span")).toMatch(
      /\bfont-weight:\s*650\b/,
    );

    expect(declarationBlock(".ownedPassportPreview")).toMatch(/\bwidth:\s*min\(100%,\s*320px\)/);
    expect(declarationBlock(".ownedPassportLink")).toMatch(/\bwidth:\s*100%/);

    expect(declarationBlock(".summaryTextLink")).toMatch(
      /\bfont-weight:\s*650\b/,
    );
  });

  it("keeps carousel controls touch-safe and removes large sliding motion for reduced motion", () => {
    const carouselCss = readFileSync(resolve(process.cwd(), "components/fan-ui/fan-carousel.module.css"), "utf8");
    const block = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = carouselCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`));
      if (!match) throw new Error(`Missing CSS selector: ${selector}`);
      return match[1].replace(/\s+/g, " ");
    };
    // Arrows sit in their own columns beside the content, never over it.
    expect(block(".frame")).toMatch(/grid-template-columns:\s*var\(--min-target\) minmax\(0, 1fr\) var\(--min-target\)/);
    expect(block(".arrow")).toMatch(/\bwidth:\s*var\(--min-target\)/);
    expect(block(".arrow")).toMatch(/\bheight:\s*var\(--min-target\)/);
    expect(block(".arrow")).not.toMatch(/position:\s*absolute/);
    // Indicator: short pills, the current one three times as long; controls share its 44px row.
    expect(block(".indicator > span")).toMatch(/\bwidth:\s*var\(--space-2\)/);
    expect(block(".indicator > span[data-current]")).toMatch(/\bwidth:\s*var\(--space-6\)/);
    expect(block(".indicatorRow")).toMatch(/\bheight:\s*var\(--min-target\)/);
    expect(block(".indicatorRow > button")).toMatch(/\bheight:\s*var\(--min-target\)/);
    expect(declarationBlock(".heroViewport")).toMatch(/\btouch-action:\s*pan-y\s+pinch-zoom/);
    expect(declarationBlock(".heroTrack")).not.toMatch(/\btransition:\s*transform/);
    expect(heroCarouselSource).toContain('useEmblaCarousel({');
    expect(heroCarouselSource).toContain('ref={viewportRef}');
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.heroCarousel\[data-reduced-motion="true"\]\s+\.heroTrack\s*\{[^}]*transform:\s*none\s*!important/,
    );
    expect(css).toMatch(
      /@media\s*\(min-width:\s*80rem\)[\s\S]*?\.heroContent\s*\{\s*padding:\s*48px\s+48px\s+48px\s+64px/,
    );
  });
});
