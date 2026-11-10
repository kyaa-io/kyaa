// 합성 fixture 촬영(B13): 덕질 지갑 카드 안 [− N +]·광고 1회 교환·중단·0장·하루 한도. 사용: node run.mjs OUT_DIR
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..'), out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, 'auth.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, 'session.ts') },
  { find: /^\.\/google-rewarded-ad$/, replacement: path.join(here, 'ad.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, 'navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4192, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const browser = await chromium.launch({ headless: true }); const log = [];
const exchangeName = { ko: '교환하기', en: 'Exchange', ru: 'Обменять', th: 'แลก', fr: 'Échanger', es: 'Canjear', pt: 'Trocar' };
async function open(w, qs) { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:4192/?' + qs); await page.locator('[data-wallet-card="stan"] output').waitFor({ timeout: 15000 }); await page.waitForTimeout(400); return { ctx, page, errs }; }
const shot = (page, w, name) => page.screenshot({ path: path.join(out, `${name}-${w}.png`) });
const measure = page => page.evaluate(() => { const card = document.querySelector('[data-wallet-card="stan"]'), r = card.getBoundingClientRect();
  const clipped = [...card.querySelectorAll('button, output, a')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.textContent || e.getAttribute('aria-label'));
  return { cardHeight: Math.round(r.height), hOverflow: document.documentElement.scrollWidth > innerWidth, clipped, output: card.querySelector('output').textContent,
    buttons: [...card.querySelectorAll('button')].map(b => { const x = b.getBoundingClientRect(); return `${b.getAttribute('aria-label') ?? b.textContent}:${Math.round(x.width)}x${Math.round(x.height)}${b.disabled ? ':disabled' : ''}`; }) }; });
const toast = page => page.locator('[data-fan-toast], [role="status"], [role="alert"]').allInnerTexts().catch(() => []);
for (const w of [390, 1440]) {
  { const { ctx, page, errs } = await open(w, 'points=350'); await shot(page, w, 'a1-default-max3'); log.push({ w, case: 'default', ...await measure(page), errs });
    await page.getByRole('button', { name: '수량 줄이기' }).click(); await shot(page, w, 'a2-minus'); log.push({ w, case: 'minus', output: (await measure(page)).output }); await ctx.close(); }
  { const { ctx, page, errs } = await open(w, 'points=350'); await page.getByRole('button', { name: exchangeName.ko }).click(); await page.waitForTimeout(250); await shot(page, w, 'b1-ad-loading');
    await page.waitForTimeout(1500); await shot(page, w, 'b2-done-toast');
    log.push({ w, case: 'one-press', posts: await page.evaluate(() => window.__posts), bodies: await page.evaluate(() => window.__bodies), toast: await toast(page), after: await measure(page), dialogs: await page.locator('[role=dialog]').count(), errs }); await ctx.close(); }
  { const { ctx, page } = await open(w, 'points=350&plan=cancel'); await page.getByRole('button', { name: exchangeName.ko }).click(); await page.waitForTimeout(1200); await shot(page, w, 'c1-cancelled');
    log.push({ w, case: 'cancelled', posts: await page.evaluate(() => window.__posts), toast: await toast(page) }); await ctx.close(); }
  { const { ctx, page } = await open(w, 'points=50'); await shot(page, w, 'd1-zero'); log.push({ w, case: 'zero', ...await measure(page) }); await ctx.close(); }
  { const { ctx, page } = await open(w, 'points=350&remaining=0'); await page.getByRole('button', { name: exchangeName.ko }).click(); await page.waitForTimeout(800); await shot(page, w, 'e1-daily-limit');
    log.push({ w, case: 'daily-limit', posts: await page.evaluate(() => window.__posts), toast: await toast(page) }); await ctx.close(); }
  for (const lc of ['ko', 'ru']) { const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } }), page = await ctx.newPage(); await page.goto('http://127.0.0.1:4192/?my=1&locale=' + lc); await page.locator('[data-my-cards]').waitFor(); await page.waitForTimeout(400);
    await shot(page, w, 'h-my-' + lc); log.push({ w, case: 'my-' + lc, heights: await page.evaluate(() => [...document.querySelectorAll('[data-state]')].map(e => `${e.dataset.state}:${Math.round(e.firstElementChild.getBoundingClientRect().height)}:${[...e.querySelectorAll('dd,h2')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => `clipped ${x.textContent} ${x.scrollWidth}/${x.clientWidth}`).join(',') || 'ok'}`)) }); await ctx.close(); }
  for (const lc of ['ko', 'en', 'fr']) { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); await page.goto('http://127.0.0.1:4192/?hold=1&locale=' + lc); await page.locator('[data-wallet-card="stan"]').waitFor(); await page.waitForTimeout(400);
    await shot(page, w, 'g-loading-' + lc); log.push({ w, case: 'loading-' + lc, cardHeight: await page.evaluate(() => Math.round(document.querySelector('[data-wallet-card="stan"]').getBoundingClientRect().height)) }); await ctx.close(); }
  for (const lc of ['en', 'ru', 'th', 'fr', 'es', 'pt']) { const { ctx, page } = await open(w, 'points=350&locale=' + lc); await shot(page, w, 'f-' + lc); log.push({ w, case: 'locale-' + lc, ...await measure(page) }); await ctx.close(); }
}
console.log(JSON.stringify(log, null, 1)); await browser.close(); await server.close();
