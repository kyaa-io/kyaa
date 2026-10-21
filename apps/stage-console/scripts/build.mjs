import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
});
await build({
  entryPoints: ["host/main.mjs"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-native/main.cjs",
  external: ["electron"],
  logLevel: "info",
});
fs.copyFileSync("host/preload.cjs", "dist-native/preload.cjs");
