// 합성 fixture 렌더 + 가짜 API (운영 증거 아님). 사용: VARIANT=before|after node run.mjs OUT_DIR
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..');
const out = process.argv[2]; await mkdir(out, { recursive: true });
const V = process.env.VARIANT || 'after', before = V === 'before';
const PORT = before ? 4291 : 4292;
const alias = [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  ...(before ? [
    { find: /.*\/use-automatic-translation$/, replacement: path.join(here, 'before/use-automatic-translation.tsx') },
    { find: /.*domain\/translation-eligibility$/, replacement: path.join(here, 'before/translation-eligibility.ts') },
    { find: /.*domain\/comment-thread$/, replacement: path.join(here, 'before/comment-thread.ts') }] : []),
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, '../comment-post-local/navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }];
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite-' + V), esbuild: { jsx: 'automatic' }, resolve: { alias }, server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const A = { nickname: '팬 A', avatarUrl: '/images/avatars/star-pink.webp' };
const pid = '10000000-0000-4000-8000-000000000001';
const cid = n => `e9900000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const post = { id: pid, celebritySlug: 'elina', body: '오늘 같이 본 영상 이야기해요', visibility: 'public', revision: 1, author: A, assets: [], createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', isOwner: false, likeCount: 1, liked: false, commentCount: 9 };
const mk = (n, parent, body, min, nick) => ({ id: cid(n), postId: pid, parentId: parent ? cid(parent) : null, body, revision: 1, author: { ...A, nickname: nick }, createdAt: new Date(Date.UTC(2026, 10, 3, 0, min)).toISOString(), isOwner: false, reactions: [] });
// 서버 순서 = 최신순 평면 목록. P3(2번 부모) 의 답글 R3a(분 50), R3b(분 55) / P2 의 답글 R2(분 40) / P1 답글 없음
const seed = () => [
  mk(9, 7, '[시험] D1 dev2 대댓글 B', 55, '팬 B'), mk(8, 7, '[시험] D1 dev2 대댓글 A', 50, '팬 A2'), mk(7, null, '[시험] D1 dev2 댓글 C', 45, '팬 C'),
  mk(6, 5, '[시험] D1 dev2 대댓글', 40, '팬 D'), mk(5, null, 'Hello everyone, I love this wave so much', 30, 'Fan E'),
  mk(4, null, '두번째 페이지 댓글 2', 20, '팬 F'), mk(3, null, '두번째 페이지 댓글 1', 10, '팬 G'), mk(2, null, '[시험] D1 dev2 댓글', 5, '팬 H'), mk(1, null, '가장 오래된 한국어 댓글입니다', 1, '팬 I')];
let store = seed(); const PAGE = 5;
const reqs = [];
async function setup(page, tr) {
  await page.route('**/api/**', async route => {
    const r = route.request(), u = new URL(r.url()), p = u.pathname, json = (b, s = 200) => route.fulfill({ status: s, json: b });
    if (p === `/api/posts/${pid}` && r.method() === 'GET') return json({ post });
    if (p === `/api/posts/${pid}/comments` && r.method() === 'GET') {
      const cur = u.searchParams.get('cursor'); const start = cur ? Number(Buffer.from(cur, 'base64url').toString()) : 0;
      const items = store.slice(start, start + PAGE); const nextCursor = start + PAGE < store.length ? Buffer.from(String(start + PAGE)).toString('base64url') : null;
      return json({ items, nextCursor });
    }
    if (p === `/api/posts/${pid}/comments` && r.method() === 'POST') {
      const b = r.postDataJSON(); const n = 20 + store.length; const parentN = b.parentId ? Number(b.parentId.slice(-2)) : null;
      const c = { ...mk(n, parentN, b.body, 100 + store.length, '나'), isOwner: true }; store = [c, ...store]; return json({ id: c.id }, 201);
    }
    if (p === '/api/content-translations' || p === '/api/display-translations') { reqs.push(p); if (tr === 'fail') return json({ error: { code: 'TRANSLATION_FAILED' } }, 503); if (tr === 'ok') return json({ translatedText: '번역된 문장', translationRevision: 1 }); }
    return json({ items: [], nextCursor: null });
  });
}
const browser = await chromium.launch({ headless: true });
const results = [];
const order = page => page.$$eval('li[id^=comment-]', lis => lis.map(li => { const t = li.querySelector('p')?.textContent?.trim().slice(0, 22) ?? ''; const reply = [...li.querySelectorAll('span')].some(s => s.textContent === '답글' && li.querySelector('strong')); return t; }));
const seen = page => page.$$eval('li[id^=comment-]', lis => lis.map(li => ({ t: (li.querySelector('p')?.textContent ?? '').trim().slice(0, 24), reply: !!li.querySelector('[class*="meta"] > span') })));
async function scenario(w) {
  store = seed(); reqs.length = 0;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ko-KR' }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await setup(page, 'fail');
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForTimeout(1800);
  const r = { w, variant: V };
  r.page1 = await seen(page);
  r.alertsAfterLoad = await page.$$eval('[role=alert]', e => e.map(x => x.textContent));
  r.translateButtons = await page.$$eval('button', b => b.filter(x => /번역/.test(x.textContent || '')).length);
  r.tlReqs = [...reqs];
  await page.screenshot({ path: path.join(out, `${V}-page1-${w}.png`), fullPage: true });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(1500); r.scrolled = { alerts: await page.$$eval('[role=alert]', e => e.length), reqs: reqs.length };
  await page.evaluate(() => window.scrollTo(0, 0));
  // 번역 보기를 눌렀을 때 실패 표시
  const btn = page.getByRole('button', { name: /번역/ }).first(); r.btnLabel = await btn.textContent().catch(() => null);
  r.btnCount = await btn.count(); r.bodySample = (await page.locator('body').innerText()).slice(0,0); if (await btn.count()) { const rq0 = reqs.length; await btn.click(); await page.waitForTimeout(2500); r.pressReqs = reqs.length - rq0; r.hello = await page.locator('li[id^=comment-]', { hasText: 'Hello everyone' }).innerText(); r.alertAfterPress = await page.$$eval('[role=alert]', e => e.map(x => x.textContent)); await page.screenshot({ path: path.join(out, `${V}-pressed-${w}.png`), fullPage: true }); }
  // 더 불러오기(다음 페이지)
  const older = page.getByRole('button', { name: /이전|더|오래/ }).last();
  r.olderLabel = await page.locator('nav button').allTextContents();
  await page.locator('nav button').last().click(); await page.waitForTimeout(1200);
  r.page2 = await seen(page); await page.screenshot({ path: path.join(out, `${V}-page2-${w}.png`), fullPage: true });
  r.alertsPage2 = await page.$$eval('[role=alert]', e => e.map(x => x.textContent));
  // 최신으로 돌아가 새 답글 작성
  const newest = page.locator('nav button').first(); if (await newest.count()) { await newest.click(); await page.waitForTimeout(1000); }
  await page.locator('li[id^=comment-]', { hasText: '[시험] D1 dev2 댓글 C' }).getByRole('button', { name: '답글' }).click();
  await page.locator('textarea').fill('방금 쓴 새 답글'); await page.getByRole('button', { name: /등록|올리|보내|남기/ }).last().click(); await page.waitForTimeout(1500);
  r.afterPost = await seen(page); await page.screenshot({ path: path.join(out, `${V}-afterpost-${w}.png`), fullPage: true });
  await page.reload(); await page.waitForTimeout(1800);
  r.afterReload = await seen(page); await page.screenshot({ path: path.join(out, `${V}-reload-${w}.png`), fullPage: true });
  // 스킵 링크·내비
  r.skip = await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(x => /본문으로/.test(x.textContent || '')); if (!a) return 'none in harness'; const b = a.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  r.errs = errs; results.push(r); await ctx.close();
}
for (const w of [390, 1440]) await scenario(w);
console.log(JSON.stringify(results, null, 1));
await browser.close(); await server.close();
