import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const destination = process.argv[2],
  show = process.argv[3];
if (!destination || !show)
  throw Error(
    "Usage: node scripts/package-mac.mjs /absolute/KYAA-Stage.app /absolute/show",
  );
if (fs.existsSync(destination))
  throw Error("Output exists; choose a new version path.");
if (!fs.existsSync(path.join(show, "manifest.json")))
  throw Error("Show manifest missing.");
fs.cpSync("node_modules/electron/dist/Electron.app", destination, {
  recursive: true,
  verbatimSymlinks: true,
});
const resources = path.join(destination, "Contents", "Resources"),
  target = path.join(resources, "app");
fs.mkdirSync(target, { recursive: true });
for (const dir of ["dist", "dist-native"])
  fs.cpSync(dir, path.join(target, dir), { recursive: true });
fs.cpSync(show, path.join(target, "show"), { recursive: true });
fs.writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify({
    name: "kyaa-stage-console",
    version: "1.0.0",
    main: "dist-native/main.cjs",
  }),
);
const plist = path.join(destination, "Contents", "Info.plist");
for (const [key, value] of Object.entries({
  CFBundleName: "KYAA Stage",
  CFBundleDisplayName: "KYAA Stage",
  CFBundleIdentifier: "io.kyaa.stage-console",
}))
  execFileSync("/usr/libexec/PlistBuddy", [
    "-c",
    `Set :${key} ${value}`,
    plist,
  ]);
execFileSync(
  "/usr/bin/codesign",
  ["--force", "--deep", "--sign", "-", destination],
  { stdio: "inherit" },
);
execFileSync(
  "/usr/bin/codesign",
  ["--verify", "--deep", "--strict", destination],
  { stdio: "inherit" },
);
for (const entry of fs.readdirSync(destination, {
  recursive: true,
  withFileTypes: true,
})) {
  if (
    entry.isSymbolicLink() &&
    !fs
      .realpathSync(path.join(entry.parentPath, entry.name))
      .startsWith(path.resolve(destination) + path.sep)
  )
    throw Error("Package contains external symlink");
}
console.log(destination);
