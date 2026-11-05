import { chromium } from 'playwright';
const OUT = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/F18-RETRY-CHECK/';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.request.get('http://127.0.0.1:4231/__fail?on=1');
  await p.goto('http://127.0.0.1:4231/');
  const btn = p.getByRole('button', { name: '다시 시도' }).first();
  await btn.waitFor({ timeout: 15000 });
  const hit = await btn.evaluate(e => { const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return h === e || e.contains(h); });
  await p.screenshot({ path: OUT + `retry-failed-${w}.png` });
  const url0 = p.url(); let reqs = 0;
  p.on('request', r => { if (r.url().includes('/api/content-assets/')) reqs++; });
  await p.request.get('http://127.0.0.1:4231/__fail?on=0');
  await btn.click();
  await p.waitForTimeout(1500);
  console.log(w, 'hitIsButton', hit, 'urlSame', p.url() === url0, 'retryRequests', reqs, 'imgLoaded', await p.locator('li[data-content-asset-card] img').count());
  await p.screenshot({ path: OUT + `retry-after-${w}.png` });
  await p.close();
}
await b.close();
