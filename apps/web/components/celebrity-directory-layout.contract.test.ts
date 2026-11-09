import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { CREATOR_ROLES, creatorRoleFilterLabel } from "@/features/creator/domain/creator-role";

const css = readFileSync(
  resolve(process.cwd(), "components/celebrity-directory.module.css"),
  "utf8",
);

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!match) throw new Error(`Missing CSS selector: ${selector}`);
  return match[1].replace(/\s+/g, " ");
}

describe("celebrity directory compact row layout", () => {
  it("fits all seven category chips in the desktop row for every locale", () => {
    // jsdom cannot measure glyphs: estimate each 14px glyph at 7px on average.
    const widths = APP_LOCALES.map((locale) => ({
      locale,
      width: (["all", ...CREATOR_ROLES] as const).reduce(
        (total, role) => total + Math.max(96, Array.from(creatorRoleFilterLabel(role, locale)).length * 7 + 26),
        6 * 8,
      ),
    }));
    const longest = widths.reduce((a, b) => a.width >= b.width ? a : b);
    expect(longest.locale).toBe("es");
    for (const { locale, width } of widths) {
      for (const rowWidth of [948, 1348]) {
        expect(width, `${locale} needs ${width}px in a ${rowWidth}px row`).toBeLessThanOrEqual(rowWidth);
      }
    }
  });

  it("keeps the mobile filter scrollable and chips at the design size", () => {
    const filterCss = readFileSync(resolve(process.cwd(), "components/fan-ui/creator-roles.module.css"), "utf8");
    const tokens = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(filterCss).toMatch(/overflow-x:\s*auto/);
    expect(filterCss).toMatch(/grid-auto-flow:\s*column/);
    expect(filterCss).toMatch(/min-height:\s*var\(--fan-chip-height\)/);
    expect(filterCss).toMatch(/font-size:\s*var\(--fan-chip-size\)/);
    expect(filterCss).toMatch(/font-weight:\s*var\(--fan-tab-weight\)/);
    expect(tokens).toMatch(/--fan-chip-height:\s*36px/);
    expect(tokens).toMatch(/--fan-chip-size:\s*14px/);
    expect(tokens).toMatch(/--fan-tab-weight:\s*700/);
  });

  it("fixes the left avatar column and the right end column so every row has the same 64px grid", () => {
    const link = declarationBlock(".rowLink");
    const avatar = declarationBlock(".avatar");
    const text = declarationBlock(".rowText");
    const identity = declarationBlock(".name");
    expect(link).toMatch(/grid-template-columns:\s*48px\s+minmax\(0,\s*1fr\)\s+48px/);
    expect(link).toMatch(/\bmin-height:\s*64px/);
    expect(avatar).toMatch(/\bwidth:\s*48px/);
    expect(avatar).toMatch(/\bheight:\s*48px/);
    expect(avatar).toMatch(/\bborder-radius:\s*50%/);
    expect(text).toMatch(/\bmin-width:\s*0\b/);
    expect(identity).toMatch(/\boverflow-wrap:\s*anywhere\b/);
  });

  it("uses the shell width with hairline rows: no card outline, no grid, no filled surface", () => {
    expect(declarationBlock(".content")).not.toMatch(/\bmax-width:/);
    expect(declarationBlock(".row")).toMatch(/border-bottom:\s*1px solid var\(--color-line\)/);
    expect(css).not.toMatch(/\.grid\b/);
    expect(css).not.toMatch(/--color-soft\b/);
    expect(css).not.toMatch(/font-weight:\s*(?!400\b|700\b|800\b)\d+/);
    expect(declarationBlock(".skeletonBlock")).toMatch(/background:\s*var\(--color-accent-soft\)/);
  });

  it("makes the whole row one link with a visible inner focus ring and no fixed row height", () => {
    const link = declarationBlock(".rowLink");
    expect(link).not.toMatch(/(?<!min-)\bheight:\s*\d+px/);
    expect(css).toMatch(/\.rowLink:focus-visible\s*\{\s*outline-offset:\s*-3px/);
  });

  it("lets a long LIVE schedule wrap inside the text column instead of overflowing the row", () => {
    const live = declarationBlock(".liveSchedule");
    const time = declarationBlock(".liveSchedule time");
    expect(live).toMatch(/\bflex-wrap:\s*wrap\b/);
    expect(live).toMatch(/\bmin-width:\s*0\b/);
    expect(live).toMatch(/\bmax-width:\s*100%/);
    expect(time).toMatch(/\bmin-width:\s*0\b/);
    expect(time).toMatch(/\boverflow-wrap:\s*anywhere\b/);
    expect(time).not.toMatch(/white-space:\s*nowrap/);
  });
});
