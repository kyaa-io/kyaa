import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A module class used by a component but missing from its CSS file renders unstyled (review DS-A: `.srOnly` was dropped from
// fan-skeleton.module.css, so the hidden status line showed on 14 screens). Every `styles.name` in a fan-ui component must be defined.
const dir = resolve(process.cwd(), "components/fan-ui");
// Classes that were never defined (unstyled hooks on the base-ui menu group) before this check existed.
const hooks: Record<string, string[]> = { "fan-menu.tsx": ["group"] };

describe("fan-ui components only use classes their CSS module defines", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))) {
    const cssFile = `${dir}/${file.replace(/\.tsx$/, ".module.css")}`;
    let css: string;
    try { css = readFileSync(cssFile, "utf8"); } catch { continue; }
    const used = new Set([...readFileSync(`${dir}/${file}`, "utf8").matchAll(/\bstyles\.([A-Za-z_][\w]*)/g)].map((m) => m[1]));
    it(file, () => {
      const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
      expect([...used].filter((name) => !defined.has(name) && !(hooks[file] ?? []).includes(name))).toEqual([]);
    });
  }
});
