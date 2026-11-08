import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "features/live/ui/live-catalog-screen.module.css"),
  "utf8",
);

describe("LIVE catalog repeated action style contract", () => {
  it("uses the shared secondary treatment: 1px ink line, radius 8, no gradient (2026-11-09 8장 ④⑤)", () => {
    const actionRule = css.match(/\.action\s*\{([^}]*)\}/)?.[1];

    expect(actionRule).toBeDefined();
    expect(actionRule).toContain("border:1px solid var(--color-ink)");
    expect(actionRule).toContain("border-radius:var(--radius-control)");
    expect(actionRule).not.toContain("gradient");
  });

  it("preserves the desktop and mobile target contracts", () => {
    // Mobile actions now show their label, so the target grows with its text.
    expect(css).toMatch(/\.action\s*\{[^}]*width:auto;[^}]*min-width:76px;[^}]*min-height:44px;/);
    expect(css).toMatch(/\.actionLabel\s*\{[^}]*display:inline-flex;/);
    expect(css).toMatch(
      /@media \(min-width:48rem\)[\s\S]*?\.action\s*\{[^}]*min-width:184px;[^}]*min-height:48px;/,
    );
  });
});
