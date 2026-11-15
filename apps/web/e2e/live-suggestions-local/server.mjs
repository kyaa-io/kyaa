// Actual public page and CSS, with isolated synthetic identity/API for browser regression.
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..');
export async function startHarness(port = 4199) {
  const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(web, 'node_modules/.vite-live-suggestions'), esbuild: { jsx: 'automatic' },
    resolve: { alias: [
      { find: '@/server/seo/public-content', replacement: path.join(here, 'seo.ts') },
      { find: '@', replacement: web },
      { find: 'next/navigation', replacement: path.join(here, 'navigation.ts') },
      { find: '@privy-io/react-auth', replacement: path.join(here, 'privy.ts') },
      ...['link', 'image'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.tsx`) })),
    ] }, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [web, path.resolve(web, '../../node_modules')] } } });
  await server.listen(); return { server, baseURL: `http://127.0.0.1:${port}` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log((await startHarness()).baseURL);
