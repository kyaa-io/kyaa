import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "features/my/ui/my-screen.module.css"), "utf8");

describe("MY creator ticket row style contract", () => {
  it("limits ticket-row spacing to the direct row and centers its nested icon wrapper", () => {
    expect(css).not.toContain(".creator span:last-child { padding-top:");
    expect(css).toContain(".creator > div > span:last-child { padding-top:var(--space-1); }");
    expect(css).toContain(".creator > div > span:last-child > span { display:inline-flex; flex:none; align-items:center; justify-content:center; padding:0; line-height:0; }");
  });
});

describe("MY headings follow the fan heading tokens", () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), "features/my/ui", file), "utf8");
  it("uses the shared size, weight and leading for the profile title and section titles", () => {
    expect(css).toMatch(/\.pencilProfileCopy h1\{font-size:var\(--fan-heading-size-wide\);font-weight:var\(--fan-heading-weight\);line-height:var\(--fan-heading-leading\)/);
    expect(css).toContain(".pencilProfileCopy h1{font-size:var(--fan-heading-size)}");
    for (const file of ["my-passport-card.module.css", "my-shortcuts.module.css", "my-favorites.module.css"]) {
      const source = read(file);
      expect(source).not.toMatch(/h2 \{[^}]*font-weight:700/);
      expect(source).toMatch(/h2 \{[^}]*font-weight:var\(--fan-heading-weight\); line-height:var\(--fan-heading-leading\)/);
    }
  });
});
