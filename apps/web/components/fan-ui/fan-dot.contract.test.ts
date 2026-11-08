import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// H6: the notification dot uses the one pink accent, not the error red.
it("draws the notification dot in --color-accent", () => {
  const css = readFileSync(resolve(process.cwd(), "components/fan-ui/fan-dot.module.css"), "utf8");
  expect(css).toMatch(/\.dot\s*\{[^}]*background:\s*var\(--color-accent\)/);
  expect(css).not.toContain("--color-error");
});
