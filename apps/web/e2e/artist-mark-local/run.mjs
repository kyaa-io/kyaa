// 합성 fixture: 아티스트 표식(artist:true)이 댓글·답글 작성자 이름 옆에 보이는지 390·1440에서 촬영. 운영 증거 아님.
// 사용: node run.mjs OUT_DIR  (comment-post-local 하니스의 main.tsx를 재사용한다)
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..'), cp = path.join(here, '../comment-post-local');
const out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: cp, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(cp, 'navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4189, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const av = '/images/avatars/star-pink.webp', LONG = '아주아주긴이름을가진아티스트계정ArtistLongNameForMarkCheck';
const id = n => `e9900000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const post = { id: '10000000-0000-4000-8000-000000000001', celebritySlug: 'elina', body: '합성 글입니다', visibility: 'public', revision: 1, author: { nickname: '팬 A', avatarUrl: av }, assets: [], createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', isOwner: false, likeCount: 0, liked: false, commentCount: 3 };
const mk = (n, nick, artist) => ({ id: id(n), body: '합성 댓글입니다', nickname: nick, avatarUrl: av, createdAt: '2026-11-03T00:00:00.000Z', isOwner: false, clapCount: 0, viewerClapped: false, replyCount: 0, ...(artist === undefined ? {} : { artist }) });
const list = [['팬 1', false], ['엘리나', true], [LONG, true], ['서버값 없음', undefined]];
const browser = await chromium.launch({ headless: true });
const results = [];
for (const w of [390, 1440]) for (const view of ['detail', 'cheer', 'notice', 'cheers']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', route => { const p = new URL(route.request().url()).pathname, json = b => route.fulfill({ status: 200, json: b });
    if (p === `/api/posts/${post.id}`) return json({ post });
    if (p === `/api/posts/${post.id}/comments`) return json({ items: list.map(([nick, a], i) => ({ id: id(i + 1), postId: post.id, parentId: null, body: '합성 댓글입니다', revision: 1, author: { nickname: nick, avatarUrl: av }, createdAt: '2026-11-03T00:00:00Z', isOwner: false, reactions: [], ...(a === undefined ? {} : { artist: a }) })), nextCursor: null });
    if (p.endsWith('/replies')) return json({ total: 4, replies: list.map(([n, a], i) => { const { replyCount, ...r } = mk(i + 11, n, a); return r; }), nextCursor: null });
    if (p === '/api/celebrities/elina/notices/welcome/comments') return json({ total: 4, comments: list.map(([n, a], i) => { const { replyCount, clapCount, viewerClapped, ...r } = mk(i + 21, n, a); return r; }), nextCursor: null });
    if (p === '/api/celebrities/elina/cheers') return json({ total: 4, nextCursor: null, comments: list.map(([n, a], i) => mk(i + 31, n, a)) });
    return json({ items: [], replies: [], nextCursor: null }); });
  await page.goto(`http://127.0.0.1:4189/?view=${view}`); await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, `${view}-${w}.png`), fullPage: true });
  const geo = await page.evaluate(() => { const s = [...document.querySelectorAll('strong')].filter(e => e.nextElementSibling?.textContent?.includes('아티스트') || e.nextElementSibling?.textContent?.includes('Artist')); return { marks: document.querySelectorAll('svg.lucide-badge-check').length, rows: s.map(e => { const m = e.nextElementSibling.getBoundingClientRect(), r = e.closest('li, div').getBoundingClientRect(); return { name: e.textContent.slice(0, 8), clipped: e.scrollWidth > e.clientWidth, markInside: m.right <= innerWidth && m.left >= 0 && m.width > 40 }; }), hOverflow: document.documentElement.scrollWidth > innerWidth }; });
  if (process.env.DBG && view === 'notice') console.log(await page.evaluate(() => { const st = [...document.querySelectorAll('strong')].find(e => e.textContent.startsWith('아주')); const out = []; for (let e = st; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e), r = e.getBoundingClientRect(); out.push(`${e.tagName}.${e.className.toString().slice(0,30)} w=${Math.round(r.width)} disp=${c.display} flex=${c.flex} minw=${c.minWidth} ov=${c.overflow}`); } return out.join('\n'); }));
  results.push({ view, w, errs, ...geo }); await ctx.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close(); await server.close();
