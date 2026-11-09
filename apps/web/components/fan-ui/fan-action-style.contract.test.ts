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
const homeCss = readFileSync(
  resolve(process.cwd(), "components/guest-home.module.css"),
  "utf8",
);
const celebrityCss = readFileSync(
  resolve(process.cwd(), "components/celebrity-fan-page.module.css"),
  "utf8",
);
const designContract = readFileSync(
  resolve(process.cwd(), "../../DESIGN.md"),
  "utf8",
);

describe("shared fan action style contract", () => {
  it("keeps Passport actions distinct from Google service typography", () => {
    const passportRule = actionCss.match(/\.passport\s*\{([\s\S]*?)\n\}/)?.[1];
    const serviceRule = actionCss.match(/\.service\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(passportRule).toContain("min-height: var(--fan-action-service-height)");
    expect(passportRule).toContain("border-radius: var(--radius-pill)");
    expect(passportRule).toContain("linear-gradient(var(--color-surface), var(--color-surface)) padding-box");
    expect(passportRule).toContain("color: var(--color-service-ink)");
    expect(passportRule).toContain('"Pretendard Variable"');
    expect(passportRule).not.toContain('"Google Sans"');
    expect(serviceRule).toContain('"Google Sans"');
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

  it("uses the 48px product Primary while preserving service and Passport heights", () => {
    const primaryRule = actionCss.match(/\.primary\s*\{([\s\S]*?)\n\}/)?.[1];
    const passportRule = actionCss.match(/\.passport\s*\{([\s\S]*?)\n\}/)?.[1];
    const serviceRule = actionCss.match(/\.service\s*\{([\s\S]*?)\n\}/)?.[1];
    const homePrimaryRule = homeCss.match(/\.primaryButton\s*\{([\s\S]*?)\n\}/)?.[1];
    const celebrityPrimaryRule = celebrityCss.match(/\.heroAction\s*>\s*a\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(primaryRule).toContain("min-height: var(--fan-action-primary-height)");
    expect(homePrimaryRule).toMatch(/min-height:\s*48px/);
    expect(celebrityPrimaryRule).toMatch(/min-height:\s*48px/);
    expect(serviceRule).toContain("min-height: var(--fan-action-service-height)");
    expect(passportRule).toContain("min-height: var(--fan-action-service-height)");
    expect(designContract).toContain("48px minimum height");
    expect(designContract).toContain("Google login: 90% of card width, 52px minimum height");
    expect(designContract).toContain("Passport CTA:");
    expect(designContract).toContain("90% of card width, 52px minimum height");
  });
});

describe("FanAction primary 1단계(design-sync-1)", () => {
  it("fills primary with the single accent, no shadow, weight 700, and keeps the pill and 48 height for gate A", () => {
    const primaryRule = actionCss.match(/\.primary\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const tokens = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(primaryRule).toContain("background: var(--color-accent);");
    expect(primaryRule).toContain("box-shadow: none;");
    expect(primaryRule).not.toMatch(/gradient|color-mix/);
    expect(primaryRule).toContain("border-radius: var(--radius-pill)");
    expect(tokens).toContain("--fan-action-weight: 700;");
    expect(tokens).toContain("--fan-action-primary-height: 48px;");
    expect(tokens).not.toContain("--color-primary-action");
    expect(actionCss).not.toMatch(/\.groups\.primary/);
  });
});

describe("FanAction pressed and disabled states (design-sync-1 ③)", () => {
  it("changes only colour on press, from tokens, and never on disabled buttons", () => {
    const tokens = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    for (const token of ["--fan-action-primary-active-bg: var(--color-accent-ink)", "--fan-action-neutral-active-bg: var(--color-accent-soft)", "--fan-action-danger-active-bg:"]) expect(tokens).toContain(token);
    expect(actionCss).toMatch(/\.primary:active:not\(:disabled, \[aria-disabled="true"\]\) \{\s*background: var\(--fan-action-primary-active-bg\);/);
    expect(actionCss).toMatch(/\.danger:active:not\(:disabled, \[aria-disabled="true"\]\) \{\s*background: var\(--fan-action-danger-active-bg\);/);
    expect(actionCss).not.toMatch(/:active[^{]*\{[^}]*translateY/);
    expect(actionCss).toMatch(/\.action\.action:disabled,\s*\.action\.action\[aria-disabled="true"\] \{[^}]*opacity: var\(--fan-disabled-opacity\);/);
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

  it("dims a disabled button with opacity only: its face and ink stay the variant's own (U-1, 2026-11-09)", () => {
    expect(readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")).toMatch(/--fan-disabled-opacity:\s*\.4;/);
    const disabled = actionCss.match(/\.action\.action:disabled,\s*\.action\.action\[aria-disabled="true"\] \{[^}]*\}/)?.[0] ?? "";
    expect(disabled).not.toMatch(/background|color:/);
    expect(actionCss).not.toMatch(/:disabled[^{]*\{[^}]*background:\s*var\(--fan-action-disabled-bg\)/);
  });

  it("never paints grey: hover and press use the pink tint", () => {
    expect(actionCss).not.toMatch(/var\(--color-soft\)|var\(--color-line-subtle\)/);
    expect(actionCss).toMatch(/\.neutral:hover:not\(:disabled\),\s*\.text:hover:not\(:disabled\) \{\s*background: var\(--color-accent-soft\);/);
  });
});
