import { createRequire } from 'node:module';
const { build } = createRequire(new URL('../apps/worker/package.json', import.meta.url))('esbuild');
import { mkdir } from 'node:fs/promises';
await mkdir('work/aws-media', { recursive: true });
await build({ entryPoints: ['apps/web/server/mobile-media/aws-entry.ts'], outfile: 'work/aws-media/index.cjs', bundle: true, platform: 'node', target: 'node24', format: 'cjs', tsconfig: 'apps/web/tsconfig.json', packages: 'external', plugins: [{ name: 'server-only-marker', setup(plugin) { plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'marker' })); plugin.onLoad({ filter: /.*/, namespace: 'marker' }, () => ({ contents: '' })); } }] });
