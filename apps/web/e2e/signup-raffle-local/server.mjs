import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..');
export async function startHarness() {
 const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), esbuild: { jsx: 'automatic' },
  resolve: { alias: [
   { find: '@/features/auth/client/cognito-auth', replacement: path.join(here, 'auth.ts') },
   { find: '@', replacement: web },
   { find: 'next/dynamic', replacement: path.join(here, 'next-dynamic.tsx') },
   { find: 'next/navigation', replacement: path.join(web, 'e2e/banner-local/next-navigation.ts') },
   { find: 'next/link', replacement: path.join(web, 'e2e/mission-local/next-link.tsx') },
   { find: 'next/image', replacement: path.join(web, 'e2e/mission-local/next-image.tsx') },
  ] }, server: { host: '127.0.0.1', port: 4198, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, '../../node_modules'))] } },
 });
 await server.listen(); return { close: () => server.close(), baseURL: 'http://127.0.0.1:4198' };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await startHarness();
