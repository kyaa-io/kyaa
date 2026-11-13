import { chromium } from '@playwright/test';
const [out, ...combos] = process.argv.slice(2);
const b = await chromium.launch();
for (const c of combos) { const [loc, w, state] = c.split(':');
 const p = await b.newPage({ viewport: { width: +w, height: +w > 800 ? 900 : 844 } });
 const errors = []; p.on('pageerror', e => errors.push(e.message));
 await p.goto(`http://127.0.0.1:4207/?locale=${loc}&state=${state}`, { waitUntil: 'load', timeout: 60000 });
 await p.getByRole('heading', { level: 1 }).waitFor({ timeout: 30000 }).catch(() => {});
 await p.waitForTimeout(1200);
 if (state === 'in') { await p.getByRole('button', { name: loc === 'ko' ? '좋아요' : 'Like', exact: true }).click(); await p.waitForTimeout(450); await p.screenshot({ path: `${out}/${loc}-${w}-${state}-mid.png` }); await p.waitForTimeout(1500); }
 console.log(c, JSON.stringify(await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, header: !!document.querySelector('header'), h1: document.querySelector('h1')?.textContent, status: document.querySelector('[role=status]')?.textContent }))), errors.slice(0, 2));
 await p.screenshot({ path: `${out}/${loc}-${w}-${state}.png`, fullPage: false }); await p.close(); }
await b.close();
