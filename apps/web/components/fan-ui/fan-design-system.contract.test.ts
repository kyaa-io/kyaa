import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const tokens = read("app/globals.css");
const heading = read("components/fan-ui/fan-heading.module.css");

describe("fan design system ownership", () => {
  it("keeps the approved responsive and control dimensions in the central foundation", () => {
    for (const token of ["--fan-heading-size: 20px", "--fan-heading-size-wide: 24px", "--fan-heading-weight: 800", "--fan-heading-editorial-weight: var(--fan-heading-weight)", "--fan-action-primary-height: 44px", "--fan-h1-size: 26px", "--fan-section-size: 18px", "--fan-section-weight: 700", "--radius-pill: 999px", "--radius-card: 16px", "--radius-media: 12px", "--radius-small: 8px", "--fan-chip-height: 36px", "--fan-chip-size: 14px", "--fan-action-service-height: 52px", "--fan-action-icon-size: 18px"]) expect(tokens).toContain(token);
    expect(tokens).toContain("@media (min-width: 64rem) { :root { --fan-action-primary-height: 48px; } }");
    expect(heading).not.toContain("@media");
    expect(heading).not.toMatch(/font-size:\s*\d/);
  });
  it("uses only the 400·700·800 weights in CSS (design-sync-1 C5)", async () => {
    const { execSync } = await import("node:child_process");
    const hits = execSync("git grep -nE '(font-weight: *|font: *)(1[0-9]{2}|[2356][0-9]{2}|4[1-9][0-9]|7[1-9][0-9]|8[1-9][0-9]|9[0-9]{2})([^0-9]|$)' -- '*.css' || true", { encoding: "utf8" });
    expect(hits).toBe("");
    for (const token of ["--fan-heading-weight: 800", "--fan-number-weight: 800", "--fan-tab-weight: 700", "--fan-action-weight: 700", "--fan-description-weight: 400", "--fan-aside-title-weight: var(--fan-item-title-weight)"]) expect(tokens).toContain(token);
  });
  it("resolves every shared fan variable rather than silently falling back", () => {
    const css = heading + read("components/fan-ui/fan-action.module.css");
    for (const [, variable] of css.matchAll(/var\((--[\w-]+)\)/g)) expect(tokens, variable).toContain(`${variable}:`);
  });
  it("keeps the event catalog title exception explicit and separate from item names", () => {
    const catalog = read("features/home/ui/events-catalog-screen.module.css");
    const title = catalog.match(/\.copy h2\s*\{([^}]*)\}/)?.[1];
    expect(read("../../DESIGN.md")).toContain("use 20px/700 event titles and 16px body copy");
    expect(tokens).toContain("--fan-item-title-size: 16px");
    expect(tokens).toContain("--fan-event-catalog-title-size: var(--fan-heading-size)");
    expect(tokens).toContain("--fan-heading-size: 20px");
    expect(title).toContain("font-size: var(--fan-event-catalog-title-size)");
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

describe("gate A–E decisions (2026-11-09 15:52)", () => {
  const css = (file: string) => read(file);
  it("gives every FanAction variant and the star button the pill radius", () => {
    const action = css("components/fan-ui/fan-action.module.css");
    expect(action).toContain("var(--radius-pill)");
    expect(css("components/fan-ui/fan-star-action.module.css")).toContain("border-radius: var(--radius-pill)");
  });
  it("sizes chips 36 · 14/700 · pill radius with a 44px hit area", () => {
    for (const file of ["components/fan-ui/fan-tabs.module.css", "components/fan-ui/creator-roles.module.css"]) {
      const source = css(file);
      expect(source).toContain("min-height: var(--fan-chip-height)");
      expect(source).toContain("var(--radius-pill)");
      expect(source).toContain("inset: -4px 0");
    }
    expect(css("features/groups/ui/groups.module.css")).toMatch(/\.chip \{ position:relative;[^}]*min-height:var\(--fan-chip-height\)/);
  });
  it("sets FanHeading by level: h1 26/800 and sections 18/700, no responsive size", () => {
    expect(heading).toMatch(/\.heading\.page \{ font-size: var\(--fan-h1-size\); font-weight: var\(--fan-heading-weight\); \}/);
    expect(heading).toMatch(/\.heading\.section \{ font-size: var\(--fan-section-size\); font-weight: var\(--fan-section-weight\); \}/);
    expect(css("components/fan-ui/fan-heading.tsx")).toContain('Tag === "h1" || variant === "personal-page"');
  });
  it("shows the help tip as a text link with the details label, not a question mark", () => {
    const tip = css("components/fan-ui/fan-help-tip.tsx");
    expect(tip).toContain("detailsLabel");
    expect(tip).not.toContain("CircleHelp");
  });
});
