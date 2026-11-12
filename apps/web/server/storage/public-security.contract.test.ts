import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { bucketPolicies } from "./config";

it("limits every public bucket to inert media formats", () => {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"]);
  for (const policy of Object.values(bucketPolicies)) if (policy.public) {
    expect(policy.types.every(type => allowed.has(type))).toBe(true);
  }
});

it("centralizes DNS resolution in the pinned remote transport", () => {
  const root = join(process.cwd(), "server");
  function scan(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return scan(path);
      if (!/\.[cm]?[jt]sx?$/.test(path) || /\.(test|spec)\./.test(path) || path === join(root, "group-collection-import/safe-fetch.ts")) return [];
      return /["'](?:node:)?dns(?:\/promises)?["']/.test(readFileSync(path, "utf8")) ? [path] : [];
    });
  }
  expect(scan(root)).toEqual([]);
});
