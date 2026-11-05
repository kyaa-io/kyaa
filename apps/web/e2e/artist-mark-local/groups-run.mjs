// 합성 fixture: 아티스트 표식(artist:true)이 댓글·답글 작성자 이름 옆에 보이는지 390·1440에서 촬영. 운영 증거 아님.
// 사용: node run.mjs OUT_DIR  (comment-post-local 하니스의 main.tsx를 재사용한다)
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..'), cp = here;
const out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: cp, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(cp, 'navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4190, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const av = null, LONG = '아주아주긴이름을가진아티스트계정ArtistLongNameForMarkCheck';
const PID = 'e9900000-0000-4000-8000-000000000001', uu = n => `e9900000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const people = [['팬 1', false], ['엘리나', true], [LONG, true], ['서버값 없음', undefined]];
const mkPost = (n, [nick, a]) => ({ id: uu(n), pageId: PID, title: '합성 글 제목입니다', body: '합성 본문입니다', visibility: 'public', anonymous: false, ...(a === undefined ? {} : { artist: a }), profileId: uu(50 + n), nickname: nick, avatarUrl: null, createdAt: '2026-11-03T00:00:00.000Z', category: 'free' });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const w of [390, 1440]) for (const view of ['board', 'detail', 'members']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', route => { const p = new URL(route.request().url()).pathname, json = b => route.fulfill({ status: 200, json: b });
    const base = `/api/groups/${PID}`;
    if (p === `${base}/posts`) return json({ items: people.map((x, i) => mkPost(i + 1, x)), nextCursor: null });
    if (p === `${base}/posts/${uu(3)}`) return json(mkPost(3, people[2]));
    if (p === `${base}/posts/${uu(3)}/comments`) return json({ items: people.map(([nick, a], i) => ({ id: uu(20 + i), body: '합성 댓글입니다', profileId: uu(70 + i), nickname: nick, avatarUrl: null, anonymous: false, ...(a === undefined ? {} : { artist: a }), createdAt: '2026-11-03T00:00:00.000Z', canDelete: false, parentId: null, assets: [] })), nextCursor: null });
    if (p === `${base}/people`) return json({ items: people.map(([nick, a], i) => ({ profileId: uu(80 + i), nickname: nick, avatarUrl: null, role: 'member', ...(a === undefined ? {} : { artist: a }) })), nextCursor: null });
    return json({ items: [], nextCursor: null }); });
  await page.goto(`http://127.0.0.1:4190/?view=${view === 'detail' ? 'board' : view}${view === 'detail' ? '&post=' + uu(3) : ''}`); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, `${view}-${w}.png`), fullPage: true });
  const geo = await page.evaluate(() => { const marks = [...document.querySelectorAll('span')].filter(e => e.textContent === '인증 아티스트'); const r = marks.map(e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), clipped: b.right > innerWidth || e.scrollWidth > e.clientWidth + 1 }; }); return { marks: marks.length, anyClipped: r.some(x => x.clipped), docSW: document.documentElement.scrollWidth, vw: innerWidth }; });
  results.push({ view, w, errs, ...geo }); await ctx.close();
}
console.log(JSON.stringify(results));
await browser.close(); await server.close();
