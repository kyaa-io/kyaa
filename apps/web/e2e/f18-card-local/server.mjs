// Local fixture: real CreatorMediaPanel, synthetic API. Not dev/production evidence.
import { createServer } from 'vite';
import path from 'node:path';
import sharp from 'sharp';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..');
// Example images (synthetic): a circle near the top stands for a face; a band at the bottom marks the lower edge.
const mk = async (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#c9b6d9' } }).composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w/2}" cy="${h*0.22}" r="${Math.min(w,h)*0.14}" fill="#f5d0b5"/><rect x="0" y="${h-30}" width="${w}" height="30" fill="#17161b"/></svg>`) }]).webp().toBuffer();
const IMGS = { '11111111-1111-4111-8111-111111111111': await mk(600, 800), '22222222-2222-4222-8222-222222222222': await mk(800, 450) };
const items = [
 { id: 'p1', kind: 'photos', title: 'Cooking class with @loccitane', image: null, asset: { id: '11111111-1111-4111-8111-111111111111', width: 600, height: 800 }, href: '/c/elina/notices/photo-1', date: '2026-10-18T00:00:00Z' },
 { id: 'v1', kind: 'videos', title: 'Instagram 영상 카드', image: '/images/avatars/star-pink.webp', asset: null, href: 'https://www.instagram.com/p/DfEtowlgX1j/', date: '2026-11-03T00:00:00Z' },
 { id: 'p2', kind: 'photos', title: '두 번째 사진 카드', image: null, asset: { id: '22222222-2222-4222-8222-222222222222', width: 800, height: 450 }, href: '/c/elina/notices/photo-2', date: '2026-10-17T00:00:00Z' },
];
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(web, 'test-results/f18-card-local/vite-cache'), esbuild: { jsx: 'automatic' }, plugins: [{ name: 'api', configureServer(s) { s.middlewares.use((req, res, next) => {
 if (req.url?.startsWith('/__fail')) { globalThis.__fail = req.url.endsWith('=1'); res.end('ok'); return; }
 if (!req.url?.startsWith('/api/')) return next();
 const json = d => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); };
 if (req.url.startsWith('/api/content-assets/') && globalThis.__fail) { res.statusCode = 500; return res.end('x'); }
 if (req.url.startsWith('/api/content-assets/')) { res.setHeader('content-type', 'image/webp'); return res.end(IMGS[req.url.split('/')[3].split('?')[0]] ?? IMGS['11111111-1111-4111-8111-111111111111']); }
 if (req.url.includes('/media?')) return json({ items, nextCursor: null });
 return json({ items: [], nextCursor: null, catalog: { liveNow: [], replay: [] } });
}); } }], resolve: { alias: [
 { find: /.*components\/byus-session-provider$/, replacement: path.join(here, '../wave-media-local/session.ts') },
 { find: '@privy-io/react-auth', replacement: path.join(here, './privy.ts') },
 ...['link', 'image', 'navigation'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.${name === 'navigation' ? 'ts' : 'tsx'}`) })),
 { find: '@', replacement: web },
] }, server: { host: '127.0.0.1', port: 4231, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, '../../node_modules')), realpathSync(path.join(web, 'node_modules'))] } } });
await server.listen(); console.log('http://127.0.0.1:4231');
