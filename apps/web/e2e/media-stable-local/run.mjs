// Regression gate for the "photos flash" reports (2026-11-12): on the post detail and the notice (아티스트 소식) detail, a click anywhere, the window
// regaining focus (a re-read of the post), a like, and the original/translation switch must keep every photo node mounted and request no media again.
// Real components in a real browser; sign-in and API answers are synthetic. Usage: node apps/web/e2e/media-stable-local/run.mjs [OUT_DIR]
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..');
const out = path.resolve(process.argv[2] ?? path.join(web, 'test-results/media-stable-local')); await mkdir(out, { recursive: true });
const PORT = 4296;
const alias = [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  ...['link', 'image', 'navigation'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.${name === 'navigation' ? 'ts' : 'tsx'}`) })),
  { find: '@', replacement: web }];
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite-cache'), esbuild: { jsx: 'automatic' }, resolve: { alias }, server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [root] } } });
await server.listen();

const png = color => sharp({ create: { width: 960, height: 640, channels: 3, background: color } }).png().toBuffer();
const photos = { a: await png('#f7b6c8'), b: await png('#9fd3c7'), c: await png('#c9b8f0') };
// The point policy as the local catalog answered it on 2026-11-12 (public values), so the P badges draw as they do for a passport holder.
const catalog = JSON.parse(await readFile(path.join(here, 'dukjil-catalog.json'), 'utf8')), open3 = remaining => ({ count: 0, points: 0, remaining, stamped: false });
const pid = '10000000-0000-4000-8000-000000000001', a1 = '20000000-0000-4000-8000-000000000001', a2 = '20000000-0000-4000-8000-000000000002', n1 = '30000000-0000-4000-8000-000000000001';
const author = { nickname: '팬 A', avatarUrl: '/images/avatars/star-pink.webp' };
const state = { reaction: null, likeCount: 3, noticeReaction: null, noticeLikes: 2 };
// A new object on every read, like the real API: the screen must not depend on the answer keeping its identity.
const post = () => ({ id: pid, celebritySlug: 'elina', body: '오늘 산책 사진이에요\n날씨가 좋아서 한강에 다녀왔어요 사진 두 장 올려요', visibility: 'public', revision: 1, author, assets: [{ id: a1, width: 960, height: 640 }, { id: a2, width: 960, height: 640 }],
  createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', isOwner: false, likeCount: state.likeCount, liked: state.reaction === 'like', commentCount: 0, viewCount: 12, reaction: state.reaction, dislikeCount: null,
  bodyDoc: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '날씨가 좋아서 한강에 다녀왔어요' }] }, { type: 'attachment', attrs: { assetId: a1, kind: 'image' } },
    { type: 'paragraph', content: [{ type: 'text', text: '사진 두 장 올려요' }] }, { type: 'attachment', attrs: { assetId: a2, kind: 'image' } }] } });
const notice = () => ({ id: '40000000-0000-4000-8000-000000000001', slug: 'walk', title: '산책 다녀온 날', pinned: false, kind: 'standard', postType: 'artist_post', visibility: 'public', revision: 1, publishedAt: '2026-11-02T00:00:00Z',
  body: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '오늘은 한강을 걸었어요' }] }, { type: 'image', attrs: { src: `/api/content-assets/${n1}`, alt: '한강', width: 960, height: 640 } },
    { type: 'paragraph', content: [{ type: 'text', text: '다음 소식도 기다려 주세요' }] }, { type: 'image', attrs: { src: 'https://media.fixture.test/outside.png', alt: '노을', width: 960, height: 640 } }] } });

async function open(browser, screen, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' }), page = await context.newPage();
  const errors = [], media = [], reads = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://media.fixture.test/**', route => { media.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'image/png', body: photos.c }); });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname, method = request.method(), json = (body, status = 200) => route.fulfill({ status, json: body });
    if (p.startsWith('/api/content-assets/') || p.startsWith('/api/fan-posts/media/') || p.startsWith('/api/media/')) { media.push(p); return route.fulfill({ status: 200, contentType: 'image/png', body: p.endsWith(a2) ? photos.b : photos.a }); }
    if (method !== 'GET') writes.push(`${method} ${p}`); else reads.push(p);
    if (p === '/api/dukjil/catalog') return json(catalog);
    if (p === '/api/me/dukjil/today') return json({ kstDate: '2026-11-12', policyActive: true, totalPoints: 0, actions: { reaction: open3(5), comment: open3(10), share: open3(3) }, attendance: null, hasPassport: true });
    if (p === `/api/posts/${pid}` && method === 'GET') return json({ post: post() });
    if (p === `/api/posts/${pid}/comments`) return json({ items: [], nextCursor: null });
    if (p === `/api/posts/${pid}/like`) { const { reaction } = request.postDataJSON(), first = state.reaction === null && reaction !== 'none'; state.likeCount += (reaction === 'like') - (state.reaction === 'like'); state.reaction = reaction === 'none' ? null : reaction; return json({ reaction: state.reaction, dislikeCount: null, ...(first ? { reward: { points: 1, stamps: 0 } } : {}) }); }
    if (p === '/api/content-translations') return json({ targetType: 'fan_post', targetId: pid, targetLocale: 'en', sourceRevision: 1, cached: true, slots: { title: 'Photos from today\'s walk', article: 'The weather was lovely so I went to the Han River. Two photos.' } });
    if (p === '/api/display-translations') { const body = request.postDataJSON(), texts = body.texts ?? [body.text]; return json(body.texts ? { translatedTexts: texts.map(text => `EN ${text}`), cached: true } : { translatedText: `EN ${body.text}`, cached: true }); }
    if (p === '/api/celebrities/elina/notices/walk') return json(notice());
    if (p === '/api/celebrities/elina/notices') return json({ notices: [], nextCursor: null });
    if (p === '/api/celebrities/elina/notices/walk/comments') return json({ total: 0, comments: [], nextCursor: null });
    if (p === '/api/celebrities/elina/notices/walk/reaction') {
      if (method === 'PUT') { const { reaction } = request.postDataJSON(), first = state.noticeReaction === null && reaction !== 'none'; state.noticeLikes += (reaction === 'like') - (state.noticeReaction === 'like'); state.noticeReaction = reaction === 'none' ? null : reaction;
        return json({ reaction: state.noticeReaction, likeCount: state.noticeLikes, dislikeCount: null, ...(first ? { reward: { points: 1, stamps: 0 } } : {}) }); }
      return json({ reaction: state.noticeReaction, likeCount: state.noticeLikes, dislikeCount: null });
    }
    return json({ error: { code: 'NOT_FOUND' } }, 404);
  });
  await page.goto(`http://127.0.0.1:${PORT}/?screen=${screen}`);
  return { context, page, errors, media, reads, writes };
}

/** Marks the photo nodes now on screen and counts every photo node removed from the page from here on. */
const watch = (page, selector) => page.evaluate(selector => {
  const nodes = [...document.querySelectorAll(selector)];
  window.__photos = nodes; window.__removed = 0;
  new MutationObserver(records => { for (const record of records) for (const node of record.removedNodes) if (node instanceof Element && (node.matches('img,video') ? nodes.includes(node) : nodes.some(photo => node.contains(photo)))) window.__removed += 1; }).observe(document.body, { childList: true, subtree: true });
  return nodes.length;
}, selector);
const same = (page, selector) => page.evaluate(selector => { const now = [...document.querySelectorAll(selector)]; return { same: now.length === window.__photos.length && now.every((node, index) => node === window.__photos[index] && node.complete && node.naturalWidth > 0), removed: window.__removed }; }, selector);
const reread = async (page, reads, path) => { const before = reads.filter(item => item === path).length; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForFunction(() => true); await assertEventually(() => reads.filter(item => item === path).length > before, `a re-read of ${path} after the window regained focus`); await page.waitForTimeout(400); };
async function assertEventually(check, label, timeout = 8000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); } assert.fail(`timed out waiting for ${label}`); }

const browser = await chromium.launch({ headless: true }), evidence = [];
try {
  for (const width of [390, 1440]) for (const screen of ['post', 'notice']) {
    Object.assign(state, { reaction: null, likeCount: 3, noticeReaction: null, noticeLikes: 2 });
    const { context, page, errors, media, reads, writes } = await open(browser, screen, width);
    const selector = screen === 'post' ? '[data-post-body] img' : 'article img[width="960"]', readPath = screen === 'post' ? `/api/posts/${pid}` : '/api/celebrities/elina/notices/walk';
    await page.waitForFunction(selector => { const nodes = [...document.querySelectorAll(selector)]; return nodes.length === 2 && nodes.every(node => node.complete && node.naturalWidth > 0); }, selector, { timeout: 30000 });
    // The translation arrives by itself for an English reader of Korean text.
    const control = page.locator('[data-translation-control]').first();
    await control.waitFor(); await assertEventually(async () => (await control.getAttribute('aria-pressed')) === 'true', 'the automatic translation');
    // Like, dislike, share and the comment send button each carry the one corner point badge, on a notice as on a board post.
    const badges = page.locator('[data-earn-badge="corner"]');
    await assertEventually(async () => (await badges.count()) === 4, `${screen} ${width}: four point badges`);
    assert.deepEqual(await badges.allInnerTexts().then(texts => texts.map(text => text.match(/\+\d+/)?.[0])), ['+1', '+1', '+10', '+3'], `${screen} ${width}: badge amounts`);
    await page.screenshot({ path: path.join(out, `${screen}-points-${width}.png`), fullPage: true });
    assert.equal(await watch(page, selector), 2);
    const loaded = media.length, steps = [], reactions = () => writes.filter(item => /^PUT .*\/(like|reaction)$/.test(item));
    const step = async (name, act) => { await act(); await page.waitForTimeout(300); const result = await same(page, selector); steps.push({ name, ...result, mediaRequests: media.length - loaded }); assert.deepEqual({ ...result, mediaRequests: media.length - loaded }, { same: true, removed: 0, mediaRequests: 0 }, `${screen} ${width}: ${name}`); };
    await step('click on empty space', () => page.mouse.click(4, 300));
    await step('window focus re-read', () => reread(page, reads, readPath));
    await step('show original', async () => { await control.click(); await assertEventually(async () => (await control.getAttribute('aria-pressed')) === 'false', 'the original'); });
    await step('show translation', async () => { await control.click(); await assertEventually(async () => (await control.getAttribute('aria-pressed')) === 'true', 'the translation'); });
    await step('like', async () => { await page.getByRole('button', { name: /^Like/ }).first().click(); await assertEventually(() => reactions().length === 1, `the like write (writes: ${writes.join(', ')})`); await page.waitForTimeout(600); });
    await step('second re-read (one polling period of the return-visit refresh)', () => reread(page, reads, readPath));
    await step('page became visible again', async () => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(600); });
    await step('dislike', async () => { await page.getByRole('button', { name: /Dislike/ }).first().click(); await assertEventually(() => reactions().length === 2, 'the dislike write'); await page.waitForTimeout(600); });
    assert.deepEqual(errors, [], `${screen} ${width}: page errors`);
    await page.screenshot({ path: path.join(out, `${screen}-${width}.png`), fullPage: true });
    evidence.push({ screen, width, photos: 2, mediaLoaded: loaded, steps });
    await context.close();
  }
  // The same notice as a Korean reader sees it (no translation), for the point badges alone.
  { Object.assign(state, { noticeReaction: null, noticeLikes: 2 }); const { context, page } = await open(browser, 'notice&locale=ko', 390); await assertEventually(async () => (await page.locator('[data-earn-badge="corner"]').count()) === 4, 'ko notice: four point badges'); await page.waitForFunction(() => [...document.querySelectorAll('article img[width="960"]')].every(node => node.complete && node.naturalWidth > 0)); await page.screenshot({ path: path.join(out, 'notice-points-ko-390.png'), fullPage: true }); await context.close(); }
  await writeFile(path.join(out, 'evidence.json'), JSON.stringify({ scope: 'Real post detail and notice detail in Chromium; synthetic sign-in and API answers', checks: evidence }, null, 2));
  console.log('PASS post detail and notice detail at 390/1440: click, focus re-read, original/translation switch, like, dislike keep the same photo nodes with 0 new media requests');
} finally { await browser.close(); await server.close(); }
