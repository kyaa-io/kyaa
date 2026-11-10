import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A restored node_modules replaces `npm ci`, so it must match package-lock.json exactly.
// `npm ls` rejects a fresh `npm ci` here (overrides report "invalid"), so compare the lockfile entries with what is on disk.
export function verifyInstalledModules(root = '.') {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const hidden = JSON.parse(readFileSync(join(root, 'node_modules', '.package-lock.json'), 'utf8')).packages ?? {};
  const problems = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.includes('node_modules/') || entry.link || entry.optional) continue;
    let installed;
    try { installed = JSON.parse(readFileSync(join(root, key, 'package.json'), 'utf8')).version; } catch { installed = undefined; }
    if (hidden[key]?.version !== entry.version) problems.push(`${key}: lock ${entry.version}, install record ${hidden[key]?.version ?? 'missing'}`);
    else if (installed !== entry.version) problems.push(`${key}: lock ${entry.version}, on disk ${installed ?? 'missing'}`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let problems;
  try { problems = verifyInstalledModules(); } catch (error) { problems = [`unreadable install record: ${error.message}`]; }
  if (problems.length) {
    console.error(`Restored node_modules does not match package-lock.json (${problems.length} problems):\n${problems.slice(0, 10).join('\n')}`);
    process.exit(1);
  }
  console.log('Restored node_modules matches package-lock.json');
}
