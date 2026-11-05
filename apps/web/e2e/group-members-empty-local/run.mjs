// 합성 fixture: 회원 관리 패널을 오류·0명·회원 있음 세 상태로 390·1440에서 촬영. 운영 증거 아님. 사용: node run.mjs OUT_DIR
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..');
const out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, '../artist-mark-local/navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4191, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const uu = n => `e9900000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const items = [['합성 소유자', 'owner'], ['합성 운영진', 'manager'], ['합성 회원', 'member']].map(([nickname, role], i) => ({ profileId: uu(i + 1), nickname, avatarUrl: null, role, answer: null, tier: null, joinedAt: '2026-11-01T00:00:00Z', lastActiveAt: '2026-11-03T00:00:00Z', postCount: 2, commentCount: 5 }));
const browser = await chromium.launch({ headless: true });
for (const w of [390, 1440]) for (const state of ['error', 'empty', 'filter', 'members', 'moreError']) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', route => state === 'error' || (state === 'moreError' && route.request().url().includes('cursor=')) ? route.fulfill({ status: 500, json: { error: { code: 'X' } } }) : route.fulfill({ status: 200, json: { items: state === 'empty' ? [] : state === 'filter' ? items.filter(i => i.role === 'member') : items, nextCursor: state === 'moreError' ? 'c1' : null } }));
  await page.goto('http://127.0.0.1:4191/?locale=' + (process.argv[3] ?? 'ko')); await page.waitForTimeout(1500);
  if (state === 'empty') { await page.fill('input', '없는이름'); await page.click('form button[type=submit]'); await page.waitForTimeout(800); }
  if (state === 'moreError') { await page.getByRole('button', { name: /더 보기|More|Load more|더보기/ }).click(); await page.waitForTimeout(800); }
  if (state === 'filter') { await page.locator('button[aria-pressed]').nth(1).click(); await page.waitForTimeout(500); }
  const info = await page.evaluate(() => ({ side: document.querySelector('aside')?.innerText.replace(/\s+/g, ' ').slice(0, 120), alert: !!document.querySelector('[role=alert]'), noMatch: [...document.querySelectorAll('[role=status]')].map(e => e.textContent).join('|'), sw: document.documentElement.scrollWidth }));
  console.log(w, state, JSON.stringify(info), errs.join('|').slice(0, 150));
  await page.screenshot({ path: path.join(out, `members-${state}-${w}${process.argv[3] ? '-' + process.argv[3] : ''}.png`), fullPage: true }); await page.close();
}
await browser.close(); await server.close();
