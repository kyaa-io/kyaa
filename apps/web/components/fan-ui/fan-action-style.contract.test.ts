import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actionCss = readFileSync(
  resolve(process.cwd(), "components/fan-ui/fan-action.module.css"),
  "utf8",
);
const shellCss = readFileSync(
  resolve(process.cwd(), "components/fan-shell/fan-app-shell.module.css"),
  "utf8",
);

describe("shared fan action style contract", () => {
  it("draws primary as a solid accent fill with radius 8 and no shadow; the gradient service/passport variants are gone", () => {
    const primaryRule = actionCss.match(/\.primary\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(primaryRule).toContain("background: var(--color-page-accent)");
    expect(primaryRule).not.toMatch(/gradient|box-shadow|radius-pill/);
    expect(actionCss).not.toMatch(/gradient\(/);
    expect(actionCss).not.toMatch(/\.(service|passport)\s*\{/);
    expect(actionCss).not.toMatch(/font-family/);
  });

  it("constrains direct SVG marks inside action links", () => {
    const directIconRule = actionCss.match(/\.action\s*>\s*svg\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(directIconRule).toContain("width: var(--fan-action-icon-size)");
    expect(directIconRule).toContain("height: var(--fan-action-icon-size)");
    expect(directIconRule).toContain("flex: none");
  });

  it("keeps the shell anchor reset weaker than action classes", () => {
    expect(shellCss).toContain(":where(.frame) a { color: inherit;");
    expect(shellCss).not.toMatch(/(?:^|\n)\.frame a\s*\{/);
  });

  it("sizes primary from the shared height token (44 at 390, 48 at 1024+)", () => {
    const primaryRule = actionCss.match(/\.primary\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(primaryRule).toContain("min-height: var(--fan-action-primary-height)");
  });
});

describe("FanAction icon layout contract", () => {
  it("keeps icon slots in flex flow, never absolute", () => {
    const css = actionCss;
    const block = css.match(/\.leading,\s*\.trailing\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toMatch(/display:\s*inline-flex/);
    expect(css).not.toMatch(/svg:last-child\s*\{[^}]*position:\s*absolute/);
    expect(css).not.toMatch(/data-has-(leading|trailing)[^{]*\{[^}]*padding-inline:\s*48px/);
  });

  it("draws the loading spinner as an in-flow flex child, never an absolute pseudo-element", () => {
    const spinner = actionCss.match(/\.spinner\s*\{[^}]*\}/)?.[0] ?? "";
    expect(spinner).toMatch(/flex:\s*none/);
    expect(spinner).not.toMatch(/position:\s*absolute/);
    expect(actionCss).not.toMatch(/data-loading[^{]*::after/);
  });

  it("keeps disabled colors on the documented tokens", () => {
    expect(readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")).toMatch(/--fan-action-disabled-bg:\s*#e4e1e6/);
    expect(actionCss).toMatch(/background:\s*var\(--fan-action-disabled-bg\)/);
    expect(actionCss).toMatch(/color:\s*var\(--fan-action-disabled-ink\)/);
  });
});
