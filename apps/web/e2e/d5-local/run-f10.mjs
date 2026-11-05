// 합성 fixture(history 라우터): 목록→퀴즈 모달→Esc→목록 복귀·포커스·뒤로가기·직접 진입. 운영·dev 증거 아님.
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
  { find: 'next/navigation', replacement: path.join(here, 'nav-f10.ts') },
  { find: 'next/link', replacement: path.join(here, 'link-f10.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4192, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const uid = n => `d5000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const base = (n, kind, title, href) => ({ id: uid(n), kind, category: '팬 인증', title, description: '합성 설명', status: 'available', reward: { scorePoints: 10, ticketAmount: 0 }, actionHref: href });
const items = [base(1, 'manual', 'Manual A', `/c/elina/certifications/${uid(1)}`), base(2, 'quiz', 'Quiz B', '/c/elina/verify'), base(3, 'manual', 'Manual C', `/c/elina/certifications/${uid(3)}`), base(4, 'quiz', 'Quiz D', '/c/elina/verify')];
const browser = await chromium.launch({ headless: true });
const res = [];
const act = p => p.evaluate(() => { const e = document.activeElement; return { tag: e?.tagName, item: e?.getAttribute?.('data-certification-item') ?? null, role: e?.getAttribute?.('role') ?? null }; });
const loc = p => p.evaluate(() => location.pathname + location.search);
for (const w of [390, 1440]) for (const lc of ['ko', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', r => { const p = new URL(r.request().url()).pathname;
    if (p === '/api/me/profile') return r.fulfill({ status: 200, json: { profile: { completed: true } } });
    if (p.startsWith('/api/public/')) return r.fulfill({ status: 200, json: { intro: { celebrity: { slug: 'elina', name: '엘리나' }, quiz: { availability: 'available', totalQuestions: 3, passThreshold: 2 } } } });
    return r.fulfill({ status: 200, json: { certifications: p.startsWith('/api/me/') ? [] : items } }); });
  const list = `/community?creator=elina&tab=certifications&locale=${lc}`;
  const tag = `${lc}-${w}`; const o = { case: tag, w, lc };
  // 1) 목록 → 두 번째 퀴즈(Quiz D) 클릭 → 모달 → Esc
  await page.goto(`http://127.0.0.1:4192/f10.html?_=1`); await page.evaluate(u => { history.replaceState({}, '', u); window.dispatchEvent(new Event('f10-nav')); }, list);
  await page.waitForSelector(`a[data-certification-item="${uid(4)}"]`); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `list-${tag}.png`) });
  await page.locator(`a[data-certification-item="${uid(4)}"]`).focus(); await page.locator(`a[data-certification-item="${uid(4)}"]`).click();
  await page.waitForSelector('[role=dialog]'); await page.waitForTimeout(800);
  o.modalUrl = await loc(page); o.modalFocus = await act(page);
  await page.screenshot({ path: path.join(out, `modal-${tag}.png`) });
  await page.keyboard.press('Escape'); await page.waitForSelector(`a[data-certification-item="${uid(4)}"]`); await page.waitForTimeout(600);
  o.afterEscUrl = await loc(page); o.afterEscFocus = await act(page);
  o.dialogGone = (await page.locator('[role=dialog]').count()) === 0;
  await page.screenshot({ path: path.join(out, `after-esc-${tag}.png`) });
  // R7: Back은 모달을 다시 열지 않고 이전(진입 전) 항목으로 이동
  const len = await page.evaluate(() => history.length);
  await page.goBack(); await page.waitForTimeout(600); o.afterBackUrl = await loc(page); o.afterBackDialog = await page.locator('[role=dialog]').count();
  // 2) 닫기(X) 버튼 경로: 첫 퀴즈 Quiz B
  await page.goto(`http://127.0.0.1:4192/f10.html`); await page.evaluate(u => { history.replaceState({}, '', u); window.dispatchEvent(new Event('f10-nav')); }, list);
  await page.waitForSelector(`a[data-certification-item="${uid(2)}"]`);
  await page.locator(`a[data-certification-item="${uid(2)}"]`).click(); await page.waitForSelector('[role=dialog]'); await page.waitForTimeout(500);
  const closeBtn = page.locator('[role=dialog] button').filter({ has: page.locator('svg') }).first();
  o.closeBtnCount = await page.locator('[role=dialog] button[aria-label]').count();
  await page.locator('[role=dialog] button[aria-label]').first().click().catch(() => {}); await page.waitForTimeout(800);
  o.closeUrl = await loc(page); o.closeFocus = await act(page);
  // 2b) 목록 클릭 후 닫지 않고 떠났다가 같은 탭에서 직접 재진입 → Esc는 크리에이터 홈
  await page.goto(`http://127.0.0.1:4192/f10.html`); await page.evaluate(u => { history.replaceState({}, '', u); window.dispatchEvent(new Event('f10-nav')); }, list);
  await page.waitForSelector(`a[data-certification-item="${uid(2)}"]`);
  await page.locator(`a[data-certification-item="${uid(2)}"]`).click(); await page.waitForSelector('[role=dialog]'); await page.waitForTimeout(400);
  await page.evaluate(() => { history.pushState({}, '', '/elina'); window.dispatchEvent(new Event('f10-nav')); }); await page.waitForTimeout(300);
  await page.evaluate(l => { history.pushState({}, '', `/c/elina/verify?locale=${l}`); window.dispatchEvent(new Event('f10-nav')); }, lc);
  await page.waitForSelector('[role=dialog]'); await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  o.leftThenDirectUrl = await loc(page);
  // 2c) 목록에서 연 모달을 새로고침한 뒤 닫기
  await page.goto(`http://127.0.0.1:4192/f10.html`); await page.evaluate(u => { history.replaceState({}, '', u); window.dispatchEvent(new Event('f10-nav')); }, list);
  await page.waitForSelector(`a[data-certification-item="${uid(2)}"]`);
  await page.locator(`a[data-certification-item="${uid(2)}"]`).click(); await page.waitForSelector('[role=dialog]'); await page.waitForTimeout(400);
  await page.evaluate(() => location.reload()); await page.waitForTimeout(800); await page.waitForSelector('[role=dialog]').catch(() => {});
  o.reloadUrl = await loc(page);
  // reload은 하니스 진입점(f10.html)로 돌아가므로 경로 복원 후 닫기
  o.reloadNote = 'reload resets harness route';
  // 3) 직접 진입(마커 없음)
  const ctx2 = await browser.newContext({ viewport: { width: w, height: 900 } }), p2 = await ctx2.newPage();
  await p2.route('**/api/**', r => { const p = new URL(r.request().url()).pathname;
    if (p === '/api/me/profile') return r.fulfill({ status: 200, json: { profile: { completed: true } } });
    return r.fulfill({ status: 200, json: { intro: { celebrity: { slug: 'elina', name: '엘리나' }, quiz: { availability: 'available', totalQuestions: 3, passThreshold: 2 } } } }); });
  await p2.goto('http://127.0.0.1:4192/f10.html'); await p2.evaluate(u => { history.replaceState({}, '', u); window.dispatchEvent(new Event('f10-nav')); }, `/c/elina/verify?locale=${lc}`);
  await p2.waitForSelector('[role=dialog]'); await p2.keyboard.press('Escape'); await p2.waitForTimeout(600);
  o.directUrl = await loc(p2);
  o.errs = errs; res.push(o); await ctx2.close(); await ctx.close();
}
await writeFile(path.join(out, 'f10-results.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
await browser.close(); await server.close();
