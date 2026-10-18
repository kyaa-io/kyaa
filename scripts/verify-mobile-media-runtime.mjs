import { constants, accessSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const binaries = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path,
};

for (const [name, binary] of Object.entries(binaries)) {
  try {
    if (typeof binary !== "string") throw new Error("Unsupported platform");
    accessSync(binary, constants.X_OK);
    const result = spawnSync(binary, ["-version"], { timeout: 5_000, encoding: "utf8", maxBuffer: 32_768 });
    if (result.status !== 0 || !result.stdout.startsWith(`${name} version `)) throw new Error("Binary cannot run");
  } catch {
    console.error(`Required media binary is unavailable: ${name}`);
    process.exit(1);
  }
}
console.log(`Media runtime verified for ${process.platform}/${process.arch}.`);
