import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// 2026-11-09 브리프 v1.1 8장 ③: 글꼴은 Pretendard Variable 1벌. 정적 Pretendard UI 550·650·850 웹 글꼴은 폐기했다.
// TTF 는 공유 이미지(app/share/jjinfan) 서버 렌더에만 남는다(브라우저로 보내지 않는다).
const root = process.cwd();

describe("app font", () => {
  it("declares no static Pretendard UI web face", () => {
    const css = readFileSync(join(root, "app/globals.css"), "utf8");
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/Pretendard UI/);
    expect(readdirSync(join(root, "public/fonts/pencil")).filter((f) => f.endsWith(".woff"))).toEqual([]);
  });

  it("keeps module CSS free of the static faces", () => {
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-l", "Pretendard UI", "--", "app/**.css", "components/**.css", "features/**.css"], { cwd: root, encoding: "utf8" }).trim();
    } catch { /* git grep exits 1 when nothing matches */ }
    expect(hits).toBe("");
  });
});
