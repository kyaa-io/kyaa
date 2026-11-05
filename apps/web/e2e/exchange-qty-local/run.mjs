// 합성 fixture 촬영: 수량 선택·진행·중단. 사용: node run.mjs OUT_DIR
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
async function open(w, qs) { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:4192/?' + qs); await page.locator('form button[type=submit]').waitFor({ timeout: 15000 }); await page.waitForTimeout(600); return { ctx, page, errs }; }
const shot = (page, w, name) => page.screenshot({ path: path.join(out, `${name}-${w}.png`) });
for (const w of [390, 1440]) {
  { const { ctx, page, errs } = await open(w, 'remaining=5'); await shot(page, w, 'a1-default');
    await page.getByRole('button', { name: '3', exact: true }).click(); await shot(page, w, 'a2-pick3');
    log.push({ w, case: 'pick3', value: await page.locator('output').first().innerText(), errs, hOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      targets: await page.locator('[role=group] button').evaluateAll(n => n.map(e => { const r = e.getBoundingClientRect(); return `${e.textContent || e.getAttribute('aria-label')}:${Math.round(r.width)}x${Math.round(r.height)}`; })) });
    await ctx.close(); }
  { const { ctx, page, errs } = await open(w, 'remaining=5&plan=earn,cancel,earn'); await page.getByRole('button', { name: '3', exact: true }).click();
    await page.getByRole('button', { name: /광고 보고 교환하기/ }).click(); await page.waitForTimeout(500);
    log.push({ w, case: 'buttons-after-start', buttons: await page.getByRole('button').allInnerTexts() });
    await shot(page, w, 'b1-loading');
    const show = page.getByRole('button', { name: /광고 보기|광고 시작|보기/ }); if (await show.count()) await show.first().click();
    await page.waitForTimeout(1500); await shot(page, w, 'b2-second');
    const bar = await page.locator('[role=progressbar]').first().getAttribute('aria-valuetext').catch(() => null); log.push({ w, case: 'progress', valuetext: bar });
    const show2 = page.getByRole('button', { name: /광고 보기|광고 시작|보기/ }); if (await show2.count()) await show2.first().click();
    await page.waitForTimeout(1500); await shot(page, w, 'b3-stopped');
    log.push({ w, case: 'stopped', text: (await page.locator('body').innerText()).slice(0, 500), posts: await page.evaluate(() => window.__posts), errs }); await ctx.close(); }
  for (const lc of ['ru', 'th']) { const { ctx, page } = await open(w, 'remaining=5&locale=' + lc); await page.getByRole('button').filter({ hasText: /^3$/ }).first().click(); await shot(page, w, 'd-' + lc + '-pick3'); await ctx.close(); }
  { const { ctx, page } = await open(w, 'unit=none&remaining=5'); await page.getByRole('button', { name: /광고 보고 교환하기/ }).click(); await page.waitForTimeout(700); await shot(page, w, 'c1-nounit');
    log.push({ w, case: 'nounit', posts: await page.evaluate(() => window.__posts), text: (await page.locator('[role=status],[role=alert]').allInnerTexts()) }); await ctx.close(); }
}
console.log(JSON.stringify(log, null, 1)); await browser.close(); await server.close();
