import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ignore from "ignore";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const web = JSON.parse(readFileSync(resolve(root, "apps/web/package.json"), "utf8"));
const ignored = ignore().add(readFileSync(resolve(root, ".vercelignore"), "utf8"));

test("Vercel ships every node script required by the web build", () => {
  const paths = [...web.scripts.build.matchAll(/(?:^|&&)\s*node\s+(\S+)/g)]
    .map((match) => relative(root, resolve(root, "apps/web", match[1])));
  assert(paths.includes("scripts/verify-mobile-media-runtime.mjs"));
  for (const path of paths) {
    assert(!ignored.ignores(path), `Required build script excluded: ${path}`);
    assert(readFileSync(resolve(root, path)).length > 0);
  }
  assert(ignored.ignores("scripts/sync-web-env.mjs"));
  assert(ignored.ignores(".env.production"));
});

test("only the reviewed pinned media downloader receives install-script approval", () => {
  assert.deepEqual(packageJson.allowScripts, { "ffmpeg-static@5.3.0": true });
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  assert.equal(lock.packages["node_modules/ffmpeg-static"].version, "5.3.0");
  assert.equal(lock.packages["node_modules/ffmpeg-static"].resolved,
    "https://registry.npmjs.org/ffmpeg-static/-/ffmpeg-static-5.3.0.tgz");
});
