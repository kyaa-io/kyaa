// Real composer/upload hooks; synthetic private media API, never production storage.
import { createServer } from 'vite';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../..');
const sessions = new Map();
const assetId = '11111111-1111-4111-8111-111111111111';
const media = state => ({ assetId, state, kind: 'image', purpose: 'wave_album', contentType: 'image/jpeg', byteSize: 1000, assetVersion: 1, width: 640, height: 480, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: '2027-01-01T00:00:00Z' });
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(tmpdir(), 'byus-wave-media-local-vite'), esbuild: { jsx: 'automatic' }, plugins: [{ name: 'private-media-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => {
 if (!req.url?.startsWith('/api/')) return next();
 const referer = new URL(req.headers.referer ?? 'http://127.0.0.1:4204');
 const key = referer.searchParams.get('run') ?? 'default', scenario = referer.searchParams.get('scenario') ?? 'success';
 if (!sessions.has(key)) sessions.set(key, { reserve: 0, put: 0, complete: 0, poll: 0, album: 0, delete: 0, bytes: 0, requestIds: [], events: [] });
 const state = sessions.get(key); const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks);
 const reply = (data, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
 if (req.url === '/api/fixture/evidence') return reply(state);
 state.events.push({ method: req.method, path: req.url, bytes: body.length });
 if (req.url === '/api/me/media/uploads') { state.reserve++; state.requestIds.push(JSON.parse(body).requestId); return reply({ assetId, uploadUrl: 'http://127.0.0.1:4204/api/fixture/bytes', uploadToken: 'local-only', expiresAt: '2027-01-01T00:00:00Z', replayed: state.reserve > 1 }); }
 if (req.url === '/api/fixture/bytes') { state.put++; state.bytes += body.length; await new Promise(r => setTimeout(r, 800)); return reply({}); }
 if (req.method === 'DELETE') { state.delete++; return reply({}); }
 if (req.url.endsWith('/complete')) { state.complete++; if (scenario === 'lost-complete' && state.complete === 1) return reply({ error: { code: 'UNAVAILABLE' } }, 503); return reply(media('processing')); }
 if (req.url.startsWith('/api/me/media/uploads/')) { state.poll++; if (scenario === 'poll-failure' && state.poll === 1) return reply({ error: { code: 'UNAVAILABLE' } }, 503); return reply(media('ready')); }
 if (req.url === '/api/kyaa-wave/albums' && req.method === 'POST') { state.album++; return reply({ id: '22222222-2222-4222-8222-222222222222', revision: 1, replayed: state.album > 1 }); }
 if (req.url.startsWith('/api/kyaa-wave/albums')) return reply({ items: [], nextCursor: null });
 return reply({ error: { code: 'FIXTURE_UNHANDLED' } }, 404);
 }); } }], resolve: { alias: [
 { find: /.*components\/byus-session-provider$/, replacement: path.join(here, 'session.ts') },
 { find: '@privy-io/react-auth', replacement: path.join(here, 'privy.ts') },
 ...['link', 'image', 'navigation'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.${name === 'navigation' ? 'ts' : 'tsx'}`) })),
 { find: '@', replacement: web },
 ] }, server: { host: '127.0.0.1', port: 4204, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, '../../node_modules')), realpathSync(path.join(web, 'node_modules'))] } } });
await server.listen(); console.log('http://127.0.0.1:4204');
