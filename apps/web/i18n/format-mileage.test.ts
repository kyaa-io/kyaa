import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { APP_LOCALES } from "./locales";
import { formatMileage } from "./format-mileage";

it("formats mileage, including signed rewards and the singular English unit", () => {
  expect(formatMileage(10, "ko")).toBe("10 마일리지");
  expect(formatMileage(1, "en")).toBe("1 mile");
  expect(formatMileage(0, "en")).toBe("0 miles");
  expect(formatMileage(1234, "en", "always")).toBe("+1,234 miles");
  expect(formatMileage(-1, "en")).toBe("-1 mile");
  for (const locale of APP_LOCALES) expect(formatMileage(10, locale)).not.toMatch(/\bM\b|Ⓜ/);
});

it("keeps the single-letter mileage suffix out of application copy", () => {
  const root = join(__dirname, "..");
  const violations: string[] = [];
  const legacyUnit = /Ⓜ|>\s*M\s*<|\bunit\s*=\s*["']M["']|(?:\d|\})\s*M(?![\p{L}\p{N}_])/u;
  for (const directory of ["app", "components", "features", "i18n", "server"]) {
    const base = join(root, directory);
    for (const file of readdirSync(base, { recursive: true, encoding: "utf8" })) {
      if (!/\.(tsx?|json)$/.test(file) || /\.(?:test|island-test)\./.test(file)) continue;
      if (["fan-ui/fan-count.ts", "fan-ui/fan-num-unit.tsx", "rankings/domain/platform-followers.ts"].includes(file)) continue;
      if (statSync(join(base, file)).isFile() && readFileSync(join(base, file), "utf8").split("\n").some(line => !/^\s*\/[/\*]/.test(line) && legacyUnit.test(line))) {
        violations.push(join(directory, file));
      }
    }
  }
  expect(violations).toEqual([]);
});
