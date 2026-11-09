import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

// C9 (DS-SWEEP): the new-item dot reads as a state, so it uses --color-error and not the pink selection accent.
it("draws the notification dot in --color-error", () => {
  const css = readFileSync(resolve(process.cwd(), "components/fan-ui/fan-dot.module.css"), "utf8");
  expect(css).toMatch(/\.dot\s*\{[^}]*background:\s*var\(--color-error\)/);
  expect(css).not.toContain("--color-accent");
});
