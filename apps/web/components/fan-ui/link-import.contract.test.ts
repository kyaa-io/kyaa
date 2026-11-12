import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

/** 화면의 링크는 `hover-prefetch-link`를 쓴다. `next/link`를 직접 쓰면 viewport prefetch가 화면마다 동적 RSC 요청을 만든다. */
const webRoot = join(__dirname, "..", "..");
const wrapper = "components/fan-ui/hover-prefetch-link.tsx";

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

it("imports Link only through the shared hover-prefetch Link", () => {
  const direct = ["app", "components", "features"]
    .flatMap((directory) => sources(join(webRoot, directory)))
    .map((path) => relative(webRoot, path))
    .filter((path) => path !== wrapper)
    .filter((path) => /from\s+["']next\/link["']/.test(readFileSync(join(webRoot, path), "utf8")));
  expect(direct).toEqual([]);
});
