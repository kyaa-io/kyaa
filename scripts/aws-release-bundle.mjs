import { createRequire } from 'node:module';
import { mkdir, rm, utimes } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function deterministicZip(output, inputs) {
  const files = [...inputs].sort();
  // ZIP stores local DOS time; pin both source timestamps and timezone.
  for (const file of files) await utimes(file, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
  await rm(output, { force: true });
  execFileSync('zip', ['-j', '-X', resolve(output), ...files], { env: { ...process.env, TZ: 'UTC' }, stdio: 'pipe' });
}
export async function main() {
  const { build } = createRequire(new URL('../apps/worker/package.json', import.meta.url))('esbuild');
  await mkdir('work/aws-release', { recursive: true });
  await mkdir('work/aws-cron', { recursive: true });
  await build({ entryPoints: ['apps/worker/src/aws-scheduled-entry.ts'], outfile: 'work/aws-cron/index.cjs', bundle: true, platform: 'node', target: 'node24', format: 'cjs' });
  await build({ entryPoints: ['apps/worker/src/aws-mint-cadence-entry.ts'], outfile: 'work/aws-cron/mint-cadence.cjs', bundle: true, platform: 'node', target: 'node24', format: 'cjs' });
  await deterministicZip('work/aws-release/aws-cron.zip', ['work/aws-cron/index.cjs', 'work/aws-cron/mint-cadence.cjs']);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
