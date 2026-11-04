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
  it("keeps each row's thumbnail square and lets the text column shrink without clipping", () => {
    const card = declarationBlock(".card");
    const link = declarationBlock(".cardLink");
    const media = declarationBlock(".media");
    const identity = declarationBlock(".cardIdentity");
    const primary = declarationBlock(".cardPrimary");

    expect(card).toMatch(/\bcontainer-type:\s*inline-size\b/);
    expect(card).toMatch(/\boverflow:\s*hidden\b/);
    expect(link).toMatch(/\bgrid-template-columns:\s*var\(--thumb\)\s+minmax\(0,\s*1fr\)/);
    expect(link).toMatch(/grid-template-areas:\s*"media primary"\s*"media body"/);
    expect(media).toMatch(/\bwidth:\s*var\(--thumb\)/);
    expect(media).toMatch(/\bheight:\s*var\(--thumb\)/);
    expect(primary).toMatch(/\bflex-direction:\s*column\b/);
    expect(primary).toMatch(/\bmin-width:\s*0\b/);
    expect(identity).toMatch(/\bflex-wrap:\s*wrap\b/);
    expect(identity).toMatch(/\bmin-width:\s*0\b/);
    expect(identity).toMatch(/\boverflow-wrap:\s*anywhere\b/);
  });

  it("uses one, two and three equal columns so cards in a row share outer edges", () => {
    const grid = declarationBlock(".grid");
    expect(grid).toMatch(/\bdisplay:\s*grid\b/);
    expect(grid).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*48rem\)\s*\{\s*\.grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*80rem\)\s*\{\s*\.grid\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("makes the whole row one link with a visible inner focus ring and no fixed card height", () => {
    const link = declarationBlock(".cardLink");
    expect(link).toMatch(/\bheight:\s*100%/);
    expect(link).not.toMatch(/\b(?:min-|max-)?height:\s*\d+px/);
    expect(css).toMatch(/\.cardLink:focus-visible\s*\{\s*outline-offset:\s*-3px/);
  });

  it("lets a long LIVE schedule wrap inside the text column instead of overflowing the row", () => {
    const live = declarationBlock(".cardPrimary .liveSchedule");
    const time = declarationBlock(".liveSchedule time");
    expect(live).toMatch(/\bflex-wrap:\s*wrap\b/);
    expect(live).toMatch(/\bmin-width:\s*0\b/);
    expect(live).toMatch(/\bmax-width:\s*100%/);
    expect(time).toMatch(/\bmin-width:\s*0\b/);
    expect(time).toMatch(/\boverflow-wrap:\s*anywhere\b/);
    expect(time).not.toMatch(/white-space:\s*nowrap/);
  });
});
