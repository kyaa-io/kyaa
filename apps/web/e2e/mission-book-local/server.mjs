// Isolated browser fixture: actual product components and CSS; synthetic auth and API. Port comes from the caller.
import { createServer } from 'vite';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..'), stamps = path.join(here, '../community-stamps-local');
export async function startHarness(port) {
  const server = await createServer({
    configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(here, '.vite'), esbuild: { jsx: 'automatic' },
    resolve: { alias: [
      { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
      { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(stamps, 'privy.ts') },
      { find: /.*features\/dukjil\/ui\/dukjil-provider$/, replacement: path.join(here, 'dukjil-on.ts') },
      { find: '@', replacement: web },
      { find: 'next/navigation', replacement: path.join(stamps, 'next-navigation.ts') },
      { find: '@privy-io/react-auth', replacement: path.join(stamps, 'privy.ts') },
      ...['link', 'image'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.tsx`) })),
    ] },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, '../../node_modules')), realpathSync(path.join(web, 'node_modules'))] } },
  });
  await server.listen();
  return { server, baseURL: `http://127.0.0.1:${port}` };
}
