import { chromium } from 'playwright';
const OUT = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/F18-PHOTO-LINK/';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://127.0.0.1:4231/');
  await p.waitForSelector('li[data-media-kind]');
  await p.waitForFunction(() => document.querySelectorAll('li img').length >= 3 || !document.body.innerText.includes('불러오는 중'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const stops = [];
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Tab');
    const info = await p.evaluate(() => { const e = document.activeElement; const li = e.closest('li'); const r = li?.getBoundingClientRect(); const out = li && getComputedStyle(li).outlineStyle; return { tag: e.tagName, href: (e.getAttribute('href') || '').slice(0, 40), name: (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 50), liH: r && Math.round(r.height), aH: Math.round(e.getBoundingClientRect().height), liOutline: out }; });
    stops.push(info);
    if (info.href.includes('photo-1') || info.href.includes('photo-2')) await p.screenshot({ path: OUT + `focus-photo-${w}-${info.href.includes('photo-2')?2:1}.png` });
    if (info.href.includes('instagram')) await p.screenshot({ path: OUT + `focus-video-${w}.png` });
  }
  console.log(w, JSON.stringify(stops));
  // whole-card click: click the image area of the photo card, expect navigation attempt
  const href = await p.evaluate(() => { const img = document.querySelector('li[data-content-asset-card] img'); if (!img) return 'no-img'; const r = img.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return (hit.closest('a') || hit).getAttribute('href') || hit.tagName; });
  console.log(w, 'photo image hit ->', href, 'overflowX', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await p.close();
}
await b.close();
