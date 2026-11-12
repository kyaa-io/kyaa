import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
it("does not generate links to the retired community screen", () => {
  const offenders: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path) && !/\.test\./.test(path)) {
        const source = readFileSync(path, "utf8");
        if (/(?:href\s*[:=]|return)\s*[{]?\s*[`"']\/community(?:[?`"']|\$\{)/.test(source)) offenders.push(path);
      }
    }
  }
  walk("components"); walk("features");
  expect(offenders).toEqual([]);
});
