import { chromium } from 'playwright';
const OUT = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/F18-CROP-390/';
const b = await chromium.launch();
for (const slug of ['elina','wena','hyunji'])
for (const w of [390, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } });
  await p.goto('http://127.0.0.1:4231/?slug='+slug);
  await p.waitForSelector('li[data-content-asset-card] img', { timeout: 15000 });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => [...document.querySelectorAll('li[data-media-kind]')].map(li => { const im = li.querySelector('img'); const r = im?.getBoundingClientRect(); return { kind: li.dataset.mediaKind, li:[Math.round(li.getBoundingClientRect().width),Math.round(li.getBoundingClientRect().height)], img: im ? { nat:[im.naturalWidth,im.naturalHeight], box:[Math.round(r.width),Math.round(r.height)], ratio:+(r.width/r.height).toFixed(3), fit:getComputedStyle(im).objectFit } : null }; }));
  console.log(slug, w, 'overflowX', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), JSON.stringify(info));
  await p.screenshot({ path: OUT + `crop-${slug}-${w}.png`, fullPage: true });
  await p.close();
}
await b.close();
