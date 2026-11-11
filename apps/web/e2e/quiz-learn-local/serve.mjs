import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createServer}=await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
const here=import.meta.dirname,web=path.resolve(here,'../..'),root=path.resolve(web,'../..'),out='/tmp/quiz-learn-vite';
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, '../d5-local/navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4193, strictPort: true, fs: { allow: [root] } } });
await server.listen();
console.log('quiz learning fixture http://127.0.0.1:4193');
