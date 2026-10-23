import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const originalHashes = {
  "1.8.9": "11e8d0910a5079c954bc94241a6f2a87e6198d7f21d44f05dd235fc8733e8b1c",
  "1.7.8": "ee7af362d371ec36ea019cd955fd9521cffbb6cb1e86203a0f5a87247d41c70d",
};
const replacements = [
  ["export const RpcResponse = z.any();", "export const RpcResponse = z.any().optional();"],
  ...[["WalletRevokePermissionsRequest", "wallet_revokePermissions"], ["WalletGetAssetsRequest", "wallet_getAssets"]].map(([name, method]) => [
    `export const ${name} = z.object({\n    method: z.literal('${method}'),\n    params: z.any()\n});`,
    `export const ${name} = z.object({\n    method: z.literal('${method}'),\n    params: z.any().optional()\n});`,
  ]),
];
const hash = source => createHash("sha256").update(source).digest("hex");

// shortcut: preserve these Reown releases' Zod 3 contract until upstream supports safe Zod.
export function patchReownSchema(source, version) {
  const original = replacements.reduce((text, [before, after]) => text.replace(after, before), source);
  if (!originalHashes[version] || hash(original) !== originalHashes[version]) throw new Error("Reown schema changed; review the Zod compatibility patch before installing");
  return replacements.reduce((text, [before, after]) => text.replace(before, after), original);
}

async function main() {
  const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
  let copies = 0;
  for (const [directory, metadata] of Object.entries(lock.packages)) {
    if (!directory.endsWith("node_modules/@reown/appkit-wallet")) continue;
    const schema = new URL(`${directory}/dist/esm/src/W3mFrameSchema.js`, root);
    let source;
    try { source = await readFile(schema, "utf8"); }
    catch (error) { if (error.code === "ENOENT" && metadata.optional) continue; throw error; }
    const patched = patchReownSchema(source, metadata.version);
    if (patched !== source) await writeFile(schema, patched);
    copies++;
  }
  if (!copies) throw new Error("No installed Reown schema found for the security patch");
  console.log(`Verified Zod compatibility patch in ${copies} Reown schema(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
