import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// review DS-A: the wallet's `.gauge` (column, stretch) and fan-number's `.gauge` (row, center) had the same specificity, so whichever CSS chunk
// came last won; on 390 the common one won and the ticket and stamp tracks collapsed to width 0. The screen rules stay one class higher.
describe("stan wallet gauge owner", () => {
  it("writes every gauge rule under `.material` so it always beats the common gauge", () => {
    const css = read("features/group-wallet/ui/stan-wallet.module.css");
    const selectors = [...css.matchAll(/(?:^|[{}\s])((?:\.material\s+)?\.gauge[^{,]*)\{/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThanOrEqual(1);
    for (const selector of selectors) expect(selector).toMatch(/^\.material \.gauge/);
  });

  it("keeps the common gauge at one class and its track growing", () => {
    const css = read("components/fan-ui/fan-number.module.css");
    expect(css).toMatch(/(^|\n)\.gauge \{ display: flex;/);
    expect(css).toMatch(/\.track \{[^}]*flex: 1;[^}]*min-width: 0/);
  });
});
