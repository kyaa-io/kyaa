// 합성 fixture: 퀴즈 모달 로딩·오류 단계에서 닫기. 운영·dev 증거 아님.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..'), out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, 'nav-f10.ts') },
  { find: 'next/link', replacement: path.join(here, 'link-f10.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4193, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const intro = { intro: { celebrity: { slug: 'elina', name: '엘리나' }, quiz: { availability: 'available', totalQuestions: 3, passThreshold: 2 } } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const loc = p => p.evaluate(() => location.pathname + location.search);
const cases = [
  { name: 'intro-slow-6s', intro: { delay: 6000 }, profile: {} },
  { name: 'intro-503', intro: { status: 503 }, profile: {} },
  { name: 'intro-hang', intro: { hang: true }, profile: {} },
  { name: 'profile-slow-6s', intro: {}, profile: { delay: 6000 } },
];
for (const c of cases) for (const w of [390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage();
  await page.route('**/api/**', async r => { const p = new URL(r.request().url()).pathname;
    if (p === '/api/me/profile') { if (c.profile.delay) await sleep(c.profile.delay); return r.fulfill({ status: 200, json: { profile: { completed: true } } }); }
    if (p.startsWith('/api/public/')) { if (c.intro.hang) return; if (c.intro.delay) await sleep(c.intro.delay); if (c.intro.status) return r.fulfill({ status: c.intro.status, json: { error: 'x' } }); return r.fulfill({ status: 200, json: intro }); }
    return r.fulfill({ status: 200, json: {} }); });
  await page.goto('http://127.0.0.1:4193/f10.html'); await page.evaluate(() => { history.replaceState({}, '', '/c/elina/verify?locale=ko'); window.dispatchEvent(new Event('f10-nav')); });
  await sleep(1500);
  const st = await page.evaluate(() => ({ dialog: !!document.querySelector('[role=dialog]'), status: document.querySelector('[role=status]')?.innerText?.slice(0, 30) || null, alert: !!document.querySelector('[role=alert]'), closeBtn: !!document.querySelector('button[aria-label=닫기]'), links: [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')) }));
  await page.screenshot({ path: path.join(out, `${c.name}-${w}.png`) });
  await page.keyboard.press('Escape'); await sleep(500);
  const afterEsc = await loc(page);
  let afterX = 'n/a'; const x = page.locator('button[aria-label=닫기]');
  if (await x.count()) { await x.first().click(); await sleep(500); afterX = await loc(page); }
  console.log(JSON.stringify({ case: c.name, w, state1500ms: st, afterEsc, afterX }));
  await ctx.close();
}
await browser.close(); await server.close();
