import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** G4: AWS에서 `hostingCache`는 아무것도 보관하지 않는다. 새로 쓰는 곳은 AWS 모드 호출 수 시험이 있어야 한다. */
const webRoot = join(__dirname, "..", "..");
const allowed: Readonly<Record<string, string>> = {
  "server/tiktok/cached-tiktok-live-source.ts": "app/api/public/live-now/shared-feed.aws.test.ts",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("hostingCache call sites", () => {
  const users = sourceFiles(webRoot)
    .map((path) => relative(webRoot, path))
    .filter((path) => path !== "server/cache/hosting-cache.ts")
    .filter((path) => /from\s+["'][^"']*\/hosting-cache["']/.test(readFileSync(join(webRoot, path), "utf8")));

  it("only uses it where an AWS-mode request-count test exists", () => {
    expect(users.sort()).toEqual(Object.keys(allowed).sort());
  });

  it("keeps each registered AWS-mode test in place", () => {
    for (const test of Object.values(allowed)) {
      const body = readFileSync(join(webRoot, test), "utf8");
      expect(body).toContain('stubEnv("HOSTING_PROVIDER", "aws")');
      expect(body).toContain("toHaveBeenCalledTimes");
    }
  });
});
