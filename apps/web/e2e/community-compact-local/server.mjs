// Real community, frame and post components; loopback synthetic reads only.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
const here = import.meta.dirname, web = path.resolve(here, '../..');
const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const photos = [
 { file: 'live/kara-hero-group.jpg', width: 3826, height: 2435 },
 { file: 'celebrities/yuna/hero-studio-mobile.jpg', width: 5304, height: 7952 },
 { file: 'guest-home/elina-card.jpg', width: 1080, height: 1080 },
];
export async function startServer() {
 const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(tmpdir(), 'byus-community-compact-vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: '@/features/auth/client/cognito-auth', replacement: path.join(here, '../community-stamps-local/privy.ts') },
  { find: '@/components/byus-session-provider', replacement: path.join(here, '../translation-local/session.ts') },
  ...['link', 'image', 'navigation'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.${name === 'navigation' ? 'ts' : 'tsx'}`) })),
  { find: '@', replacement: web },
 ] }, plugins: [{ name: 'community-fixture', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
  if (!req.url?.startsWith('/api/')) return next();
  const url = new URL(req.url, 'http://127.0.0.1:4228'), referer = new URL(req.headers.referer ?? 'http://127.0.0.1:4228');
  const reply = (data, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
  if (url.pathname.startsWith('/api/content-assets/')) { const photo = photos[Number(url.pathname.at(-1)) - 1] ?? photos[0]; res.setHeader('content-type', 'image/jpeg'); return res.end(await readFile(path.join(web, 'public/images', photo.file))); }
  if (req.method !== 'GET') return reply({ error: { code: 'LOCAL_WRITES_DISABLED' } }, 503);
  if (url.pathname.endsWith('/fans')) return reply({ likeCount: 125000, fanCount: 125000, publicFanCount: 6, fans: Array.from({ length: 6 }, (_, i) => ({ profileId: uuid('3', i + 1), nickname: i === 1 ? '긴이름도빠짐없이보여주는MusicFanWithALongName' : `music.fan${i + 1}`, avatarUrl: '/images/avatars/star-cream.webp' })) });
  if (url.pathname.endsWith('/replies')) return reply({ total: 1, replies: [{ id: uuid('5', 1), nickname: '함께하는 팬', avatarUrl: '/images/avatars/star-cream.webp', body: '저도 기대돼요!', createdAt: '2026-09-21T01:00:00Z', isOwner: false, clapCount: 0, viewerClapped: false }], nextCursor: null });
  if (url.pathname.endsWith('/feed')) {
   const state = referer.searchParams.get('state');
   if (state === 'error') return reply({ error: { code: 'UNAVAILABLE' } }, 503);
   const slug = url.pathname.split('/')[3], second = url.searchParams.has('cursor');
   let items = Array.from({ length: second ? 1 : 4 }, (_, i) => ({ kind: 'fan_post', id: uuid('1', i + (second ? 5 : 1)), celebritySlug: slug, body: i === 3 ? '사진 없이 나누는 긴 이야기. 함께한 공연의 순간을 오래 기억하고 싶어요.' : `${slug} 함께해서 더 즐거웠던 하루! 다음 공연에서도 다시 만나요.`, visibility: 'public', revision: 1, author: { nickname: i === 1 ? '긴이름도빠짐없이보여주는MusicFanWithALongName' : 'music.fan', avatarUrl: '/images/avatars/star-cream.webp' }, assets: i < 3 ? [{ id: uuid('2', i + 1), width: photos[i].width, height: photos[i].height }] : [], createdAt: '2026-10-03T04:21:00Z', updatedAt: '2026-10-03T04:21:00Z', isOwner: false, likeCount: 12, liked: false, commentCount: 3 }));
   if (referer.searchParams.has('legacy')) items = second ? [{ kind: 'cheer', id: uuid('4', 1), nickname: '오래전부터 함께한 MusicFanWithALongName', avatarUrl: '/images/avatars/star-cream.webp', body: '라이브 기대됩니다! 오래된 응원글도 함께 나눠요. ❤️', createdAt: '2026-09-20T01:00:00Z', isOwner: false, clapCount: 2, viewerClapped: false, replyCount: 1 }] : items.slice(0, 1);
   if (url.searchParams.get('media') === '1') items = items.filter(item => item.assets.length);
   return reply({ items: state === 'empty' ? [] : items, nextCursor: state === 'empty' || second ? null : 'synthetic-page-2', unavailableSources: [] });
  }
  return reply({ error: { code: 'FIXTURE_UNHANDLED' } }, 404);
 }); } }], server: { host: '127.0.0.1', port: 4228, strictPort: true, fs: { allow: [web, path.resolve(web, '../..'), realpathSync(path.join(web, 'node_modules')), realpathSync(path.resolve(web, '../../node_modules'))] } } });
 await server.listen(); return server;
}
if (process.argv[1] === import.meta.filename) { await startServer(); console.log('http://127.0.0.1:4228/community?creator=elina&locale=ko'); }
