import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
