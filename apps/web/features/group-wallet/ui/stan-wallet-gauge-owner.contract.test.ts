import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// review DS-A: the wallet's `.gauge` (column, stretch) and fan-number's `.gauge` (row, center) had the same specificity, so whichever CSS chunk
// came last won; on 390 the common one won and the ticket and stamp tracks collapsed to width 0. The screen rules stay one class higher.
describe("stan wallet gauge owner", () => {
  it("the wallet draws no bar or gauge of its own (대표 11/14 18:22 N8 took the empty gray bar out of the swap line), so no wallet rule fights the common gauge", () => {
    const css = read("features/group-wallet/ui/stan-wallet.module.css");
    expect(css).not.toMatch(/\.gauge\b/);
    expect(css).not.toMatch(/\.bar(Fill)?\b/);
  });

  it("keeps the common gauge at one class and its track growing", () => {
    const css = read("components/fan-ui/fan-number.module.css");
    expect(css).toMatch(/(^|\n)\.gauge \{ display: flex;/);
    expect(css).toMatch(/\.track \{[^}]*flex: 1;[^}]*min-width: 0/);
  });
});
