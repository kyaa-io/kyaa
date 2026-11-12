import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const tokens = read("app/globals.css");
const heading = read("components/fan-ui/fan-heading.module.css");

const invalidWeightPattern = "(font-weight: *|font: *)(1[0-9]{2}|[2356][0-9]{2}|4[1-9][0-9]|7[1-9][0-9]|8[1-9][0-9]|9[0-9]{2})([^0-9]|$)";

function gitIn(cwd: string, args: string[], isolated = false) {
  const env = isolated
    ? Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))
    : process.env;
  const config = isolated
    ? ["-c", "user.name=Contract Test", "-c", "user.email=contract@example.invalid", "-c", `safe.directory=${cwd}`]
    : [];
  return spawnSync("git", [...config, ...args], { cwd, env, encoding: "utf8" });
}

function assertIndexedCssWeights(cwd: string, isolated = false) {
  const indexed = gitIn(cwd, ["ls-files", "-z", "--", "*.css"], isolated);
  if (indexed.error || indexed.status !== 0) throw new Error(`Cannot list indexed CSS: ${indexed.error?.message ?? indexed.stderr}`);
  if (!indexed.stdout) throw new Error("No indexed CSS files to check");

  const search = gitIn(cwd, ["grep", "-nE", invalidWeightPattern, "--", "*.css"], isolated);
  if (search.error || (search.status !== 0 && search.status !== 1)) throw new Error(`Cannot search indexed CSS: ${search.error?.message ?? search.stderr}`);
  if (search.status === 0) throw new Error(`Unsupported CSS font weight:\n${search.stdout}`);
  if (search.stdout) throw new Error(`Unexpected Git search output: ${search.stdout}`);
}

describe("indexed CSS font weight search", () => {
  function inTemporaryTree(callback: (dir: string) => void, indexedCss?: string | null) {
    const dir = mkdtempSync(resolve(tmpdir(), "fan-weight-contract-"));
    try {
      if (indexedCss !== undefined) {
        const init = gitIn(dir, ["init", "-q"], true);
        expect(init.status).toBe(0);
        if (indexedCss !== null) {
          writeFileSync(resolve(dir, "sample.css"), indexedCss);
          const add = gitIn(dir, ["add", "sample.css"], true);
          expect(add.status).toBe(0);
        }
      }
      callback(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("passes when indexed CSS has no invalid weight", () => {
    inTemporaryTree((dir) => expect(() => assertIndexedCssWeights(dir, true)).not.toThrow(), ".a{font-weight:700}");
  });
  it("fails when indexed CSS has an invalid weight", () => {
    inTemporaryTree((dir) => expect(() => assertIndexedCssWeights(dir, true)).toThrow(/sample.css:1:.*font-weight:600/), ".a{font-weight:600}");
  });
  it("fails on a Git error", () => {
    inTemporaryTree((dir) => expect(() => assertIndexedCssWeights(dir, true)).toThrow(/Cannot list indexed CSS/));
  });
  it("fails when the Git index has no CSS", () => {
    inTemporaryTree((dir) => expect(() => assertIndexedCssWeights(dir, true)).toThrow(/No indexed CSS/), null);
  });
});

describe("fan design system ownership", () => {
  it("keeps the approved responsive and control dimensions in the central foundation", () => {
    for (const token of ["--fan-heading-size: 20px", "--fan-heading-size-wide: 24px", "--fan-heading-weight: 800", "--fan-heading-editorial-weight: var(--fan-heading-weight)", "--fan-action-primary-height: 44px", "--fan-h1-size: 26px", "--fan-section-size: 18px", "--fan-section-weight: 700", "--radius-pill: 999px", "--radius-card: 16px", "--radius-media: 12px", "--radius-small: 8px", "--fan-chip-height: 36px", "--fan-chip-size: 14px", "--fan-action-service-height: 52px", "--fan-action-icon-size: 18px"]) expect(tokens).toContain(token);
    expect(tokens).toContain("@media (min-width: 64rem) { :root { --fan-action-primary-height: 48px; } }");
    expect(heading).not.toContain("@media");
    expect(heading).not.toMatch(/font-size:\s*\d/);
  });
  it("uses only the 400·700·800 weights in CSS (design-sync-1 C5)", () => {
    assertIndexedCssWeights(process.cwd());
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
