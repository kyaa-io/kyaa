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

describe("MY headings follow the fan heading roles", () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), "features/my/ui", file), "utf8");
  it("leaves h1/h2 size to FanHeading and keeps card titles on the item-title token", () => {
    expect(css).toContain(".pencilProfileCopy h1{overflow-wrap:anywhere}");
    for (const file of ["my-passport-card.module.css", "my-shortcuts.module.css"]) expect(read(file)).not.toMatch(/h[12] \{[^}]*font-size/);
    for (const file of ["my-passport-card.tsx", "my-shortcuts.tsx", "my-screen.tsx"]) expect(read(file)).not.toMatch(/<h[12][ >]/);
    expect(read("my-passport-card.module.css")).toContain(".facts h3 { margin:0; font-size:var(--fan-item-title-size);");
  });
});
