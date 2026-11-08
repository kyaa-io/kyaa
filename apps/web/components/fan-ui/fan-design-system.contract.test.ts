import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const tokens = read("app/globals.css");
const heading = read("components/fan-ui/fan-heading.module.css");

describe("fan design system ownership", () => {
  it("keeps the approved responsive and control dimensions in the central foundation", () => {
    // 2026-11-09 브리프 v1.1 8장 ②④: h1 26/800 · h2 18/700, primary 44(390)/48(1024+), 반경 12/8.
    for (const token of ["--fan-heading-size: 26px", "--fan-heading-weight: 800", "--fan-section-size: 18px", "--fan-section-weight: 700", "--fan-hero-number-size: 44px", "--fan-hero-number-size-wide: 48px", "--fan-action-primary-height: 44px", "--fan-action-primary-height: 48px", "--fan-action-icon-size: 18px", "--radius-card: 12px", "--radius-control: 8px", "--motion-fast: 150ms", "--motion-slow: 200ms"]) expect(tokens).toContain(token);
    for (const gone of ["--color-primary-action", "--color-coin", "--color-foil", "--shadow-dialog", "--radius-collection", "--radius-hero", "--motion-control", "--motion-layout", "--fan-heading-size-wide"]) expect(tokens).not.toContain(`${gone}:`);
    expect(heading).not.toMatch(/font-size:\s*\d/);
  });
  it("resolves every shared fan variable rather than silently falling back", () => {
    const css = heading + read("components/fan-ui/fan-action.module.css");
    for (const [, variable] of css.matchAll(/var\((--[\w-]+)\)/g)) expect(tokens, variable).toContain(`${variable}:`);
  });
  it("keeps the event catalog title exception explicit and separate from item names", () => {
    const catalog = read("features/home/ui/events-catalog-screen.module.css");
    const title = catalog.match(/\.copy h2\s*\{([^}]*)\}/)?.[1];
    expect(tokens).toContain("--fan-item-title-size: 15px");
    expect(tokens).toContain("--fan-section-size: 18px");
    expect(title).toContain("font-size: var(--fan-section-size)");
    expect(title).toContain("font-weight: var(--fan-item-title-weight)");
  });
  it("keeps the event catalog within the shared full-width shell", () => {
    const catalog = read("features/home/ui/events-catalog-screen.module.css");
    const pagination = read("features/home/ui/events-pagination.module.css");
    expect(read("../../DESIGN.md")).toContain("HOME, event catalog, LIVE list");
    for (const [css, selector] of [[catalog, "list"], [catalog, "state"], [pagination, "pagination"]] as const) {
      const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1];
      expect(rule, selector).toBeDefined();
      expect(rule, selector).not.toMatch(/max-width\s*:/);
    }
  });
  it("prevents the migrated screen headings from regaining local style ownership", () => {
    const migrated = [
      ["components/guest-home", /\.sectionHeadingRow|\.sectionIntro/],
      ["features/live/ui/live-catalog-screen", /\.groupHeading|\.intro\s+h1/],
      ["features/live/ui/live-calendar-screen", /\.intro\s+h1/],
      ["features/my/ui/my-screen", /\.sectionTitle|\.pageHeading\s+h1/],
    ] as const;
    for (const [path, obsolete] of migrated) {
      const css = read(`${path}.module.css`);
      // The approved desktop calendar artwork has its own display title.
      // Its mobile heading remains owned by the shared FanHeading component.
      if (path === "features/live/ui/live-calendar-screen") expect(css.indexOf("@media (min-width:64rem)")).toBeGreaterThan(0);
      const sharedHeadingCss = path === "features/live/ui/live-calendar-screen"
        ? css.slice(0, css.indexOf("@media (min-width:64rem)"))
        : css;
      expect(sharedHeadingCss, path).not.toMatch(obsolete);
      expect(read(`${path}.tsx`), path).toMatch(/import \{[^}]*Fan(?:Heading|SectionHeader)/);
    }
  });
  it("keeps headings variant-controlled rather than exposing arbitrary style overrides", () => {
    const component = read("components/fan-ui/fan-heading.tsx");
    expect(component).not.toMatch(/(?:className|style)\?:/);
    expect(component).toContain('"personal-page"');
  });
});
