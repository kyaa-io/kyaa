// 합성 fixture: 팬 인증 원형 스탬프 그리드(긴 이름·많은 항목·0개)와 인증 시작 모달(포커스·Esc·오류 3종)을 390·1440에서 촬영. 운영·dev 증거 아님.
// 사용: node run.mjs OUT_DIR
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..'), out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, 'navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4191, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const uid = n => `d5000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const LONG = '아주아주아주긴이름을가진인증미션제목LongCertificationTitleForFixtureCheck 이어지는 두 번째 줄 문장';
const kinds = [['quiz', undefined], ['live_mission', undefined], ['manual', 'instagram'], ['manual', 'tiktok'], ['manual', 'youtube'], ['manual', undefined]];
const mk = (n, i) => { const [kind, mp] = kinds[i % kinds.length]; const status = i % 7 === 5 ? 'preparing' : i % 7 === 6 ? 'closed' : 'available';
  return { id: uid(n), kind, category: i % 2 ? '멤버십' : '팬 인증', title: i % 3 === 0 ? LONG : `인증 ${n}`, description: '합성 설명', status, reward: status === 'available' ? { scorePoints: 10, ticketAmount: i % 2, ...(mp ? { stampCount: 1 } : {}) } : null, actionHref: `/c/elina/certifications/${uid(n)}`, ...(mp ? { membershipPlatform: mp } : {}) }; };
const sets = { many: Array.from({ length: 14 }, (_, i) => mk(i + 1, i)), one: [mk(1, 0)], zero: [], twoLong: [mk(1, 0), mk(2, 3)] };
const browser = await chromium.launch({ headless: true });
const results = [];
async function open(w, url, handler) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', handler); await page.goto(url); return { ctx, page, errs };
}
for (const w of [390, 1440]) {
  for (const [name, items] of Object.entries(sets)) {
    const { ctx, page, errs } = await open(w, 'http://127.0.0.1:4191/?view=grid', r => r.fulfill({ status: 200, json: { certifications: new URL(r.request().url()).pathname.startsWith('/api/me/') ? [] : items } }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `grid-${name}-${w}.png`), fullPage: true });
    const geo = await page.evaluate(() => { const t = [...document.querySelectorAll('[class*="tile"]')].filter(e => e.querySelector('[class*="stamp"]')); const clip = [];
      for (const e of t) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 0.5 || r.left < -0.5) clip.push('tile-out'); const ti = e.querySelector('[class*="tileTitle"]'); if (ti && ti.scrollHeight > ti.clientHeight + 1 && getComputedStyle(ti).webkitLineClamp === 'none') clip.push('title-cut'); }
      const rows = new Set(t.map(e => Math.round(e.getBoundingClientRect().top))); const cols = t.length ? Math.round(innerWidth / t[0].getBoundingClientRect().width) : 0;
      return { tiles: t.length, rows: rows.size, approxCols: cols, tileW: t[0] ? Math.round(t[0].getBoundingClientRect().width) : 0, tileH: t[0] ? Math.round(t[0].getBoundingClientRect().height) : 0, clip, hOverflow: document.documentElement.scrollWidth > innerWidth }; });
    results.push({ case: `grid-${name}`, w, errs, ...geo }); await ctx.close();
  }
  { const four = Array.from({ length: 4 }, (_, i) => ({ ...mk(i + 1, i), status: 'available', title: `인증 ${i + 1}`, reward: { scorePoints: 10, ticketAmount: 0 } }));
    const hist = [0, 2].map(i => ({ id: uid(50 + i), kind: four[i].kind, missionId: four[i].id, title: four[i].title, status: 'approved', attemptNumber: 1, rejectionReason: null, submittedAt: '2026-11-04T00:00:00.000Z', reviewedAt: null, actionHref: four[i].actionHref, ...(four[i].membershipPlatform ? { membershipPlatform: four[i].membershipPlatform } : {}) }));
    const { ctx, page, errs } = await open(w, 'http://127.0.0.1:4191/?view=grid', r => r.fulfill({ status: 200, json: { certifications: new URL(r.request().url()).pathname.startsWith('/api/me/') ? hist : four } }));
    await page.waitForTimeout(1200); await page.screenshot({ path: path.join(out, `contrast-approved-available-${w}.png`), fullPage: true });
    results.push({ case: 'contrast', w, errs, states: await page.evaluate(() => [...document.querySelectorAll('[data-state]')].map(e => e.getAttribute('data-state') + ':' + getComputedStyle(e).filter)) }); await ctx.close(); }
  // 인증 시작 모달: 정상 + 오류 3종
  const prof = { ok: r => r.fulfill({ status: 200, json: { profile: { completed: true } } }), auth: r => r.fulfill({ status: 401, json: {} }), server: r => r.fulfill({ status: 503, json: {} }), network: r => r.abort('failed') };
  for (const [name, h] of Object.entries(prof)) {
    const { ctx, page, errs } = await open(w, 'http://127.0.0.1:4191/?view=quiz', route => { const p = new URL(route.request().url()).pathname;
      if (p === '/api/me/profile') return h(route);
      if (p.startsWith('/api/public/')) return route.fulfill({ status: 200, json: { intro: { celebrity: { slug: 'elina', name: '엘리나' }, quiz: { availability: 'available', totalQuestions: 3, passThreshold: 2 } } } });
      return route.fulfill({ status: 200, json: {} }); });
    await page.waitForSelector('[role=dialog]'); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, `modal-${name}-${w}.png`) });
    const info = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const r = d.getBoundingClientRect(); const a = document.activeElement; return { aria: d.getAttribute('aria-modal'), focusInside: d.contains(a), focusTag: a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent || '').slice(0, 14), dialog: [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)], text: d.textContent.slice(0, 160), hOverflow: document.documentElement.scrollWidth > innerWidth }; });
    let esc;
    if (name === 'ok') { await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); const trap = await page.evaluate(() => document.querySelector('[role=dialog]').contains(document.activeElement)); await page.keyboard.press('Escape'); await page.waitForTimeout(200); esc = { trapInside: trap, nav: await page.evaluate(() => window.__nav) }; }
    results.push({ case: `modal-${name}`, w, errs, ...info, ...(esc ? { esc } : {}) }); await ctx.close();
  }
}
await writeFile(path.join(out, 'fixture-results.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
await browser.close(); await server.close();
