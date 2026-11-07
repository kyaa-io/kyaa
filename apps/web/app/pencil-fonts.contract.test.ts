import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The full Pencil TTFs (3MB each) took ~30s on 4G and starved the scripts, so 덕질·홈 LCP waited for them.
// Each weight must be a small core file for common text plus a rest file fetched only for other characters.
const root = process.cwd();
const faces = () => {
  const css = readFileSync(join(root, "app/globals.css"), "utf8");
  return [...css.matchAll(/@font-face\{font-family:"(Pretendard UI \d+)";src:url\('([^']+)'\)[^}]*unicode-range:([^;}]+)/g)].map((m) => ({ family: m[1], url: m[2], range: m[3] }));
};

describe("Pencil UI fonts", () => {
  it("never ships the full TTF to the browser", () => {
    for (const file of ["components/fan-shell/fan-app-shell.module.css", "app/globals.css"]) {
      expect(readFileSync(join(root, file), "utf8")).not.toMatch(/PretendardUI\d+\.ttf/);
    }
  });

  it("serves each weight as a small core file declared after its rest file", () => {
    const all = faces();
    for (const weight of ["550", "650", "850"]) {
      const family = all.filter((face) => face.family === `Pretendard UI ${weight}`);
      expect(family.map((face) => face.url)).toEqual([`/fonts/pencil/PretendardUI${weight}-rest.woff`, `/fonts/pencil/PretendardUI${weight}-core.woff`]);
      expect(statSync(join(root, "public", family[1]!.url)).size).toBeLessThan(400 * 1024);
      // common Korean text ("응원하러 가기") and Latin resolve to core; rest never claims them.
      for (const char of ["응", "원", "하", "러", "가", "기", "A"]) {
        const code = char.codePointAt(0)!;
        const covers = (range: string) => range.split(",").some((part) => { const [a, b] = part.trim().slice(2).split("-"); return code >= parseInt(a!, 16) && code <= parseInt(b ?? a!, 16); });
        expect(covers(family[1]!.range)).toBe(true);
        expect(covers(family[0]!.range)).toBe(false);
      }
    }
  });
});
