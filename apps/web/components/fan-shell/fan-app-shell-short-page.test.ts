import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Mobile short pages stretch the frame's last child to the viewport; grid pages must not hand that spare height to their rows
// (rankings period tabs grew to 173px). Real height is measured by e2e/rankings-short-local/tabs-height.mjs.
describe("fan shell short-page min-height", () => {
  it("keeps grid rows content-sized inside the mobile min-height rule", () => {
    const css = readFileSync(join(process.cwd(), "components/fan-shell/fan-app-shell.module.css"), "utf8");
    const rule = css.match(/\.frame > :has\(\+ \[data-fan-site-footer\]\)\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("min-height");
    expect(rule).toMatch(/grid-auto-rows:\s*max-content/);
  });
});
