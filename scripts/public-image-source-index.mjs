import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// The storage contract embeds the full content hash in every valid storage path.
const identifiers = /[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi;
const references = new Map();
const skip = new Set(["node_modules", ".git", ".next", "coverage", "outputs", "work", "test-results", "playwright-report"]);
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) await scan(file);
    } else if (entry.isFile() && !entry.name.startsWith(".env") && !file.endsWith(".tsbuildinfo") && !file.endsWith("public-image-source-index.json")) {
      const bytes = await readFile(file);
      if (bytes.includes(0)) continue;
      for (const match of new Set(bytes.toString("utf8").match(identifiers) ?? [])) {
        const key = match.toLowerCase();
        if (!references.has(key)) references.set(key, new Set());
        references.get(key).add(file);
      }
    }
  }
}
for (const root of ["apps", "packages", "supabase", "content", "contracts", "infrastructure", "scripts", "tools"]) await scan(root);
const index = Object.fromEntries([...references].map(([key, files]) => [key, [...files].sort()]));
await writeFile(process.argv[2], JSON.stringify(index));
