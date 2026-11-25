import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const WEB = resolve(__dirname, "../../..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (name === "node_modules" || name === ".next") return [];
  return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
});

it("links the fan list at ?tab=members; the old ?tab=fans is not a tab and falls back to home", () => {
  const files = ["app", "components", "features"].flatMap(dir => walk(join(WEB, dir))).filter(path => !path.endsWith("fan-list-links.test.ts"));
  expect(files.filter(path => readFileSync(path, "utf8").includes("tab=fans"))).toEqual([]);
  for (const name of ["stan-lucky-cheer.tsx", "duo-profile.tsx"]) {
    expect(readFileSync(join(WEB, "features/groups/ui", name), "utf8")).toContain("?tab=members&locale=");
  }
});
