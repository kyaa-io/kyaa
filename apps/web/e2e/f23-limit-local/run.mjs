import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { startHarness, state } from './server.mjs';

const out = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/F23-LIMIT-LINE-2';
await mkdir(out, { recursive: true });
const jpg = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#d6a6ee' } }).jpeg().toBuffer();
const files = n => Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: jpg }));
const server = await startHarness(), browser = await chromium.launch(), report = [];

async function overlap(page) {
  return page.evaluate(() => {
    const rects = [];
    const alerts = [...document.querySelectorAll('[role=alert]')];
    const result = [];
    for (const a of alerts) {
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      const textRects = [];
      let n;
      while ((n = walker.nextNode())) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) textRects.push(q);
      }
      const buttons = [...document.querySelectorAll('button')].filter(b => b.offsetParent);
      const hit = (x, y) => !(x.right <= y.left + .5 || y.right <= x.left + .5 || x.bottom <= y.top + .5 || y.bottom <= x.top + .5);
      for (const b of buttons) {
        const br = b.getBoundingClientRect();
        if (textRects.some(t => hit(t, br))) result.push({ alert: a.textContent.trim().slice(0, 60), button: b.textContent.trim().slice(0, 30), textOverlapsButton: true });
      }
      const inner = [...a.querySelectorAll('button')].map(b => b.getBoundingClientRect());
      const outer = buttons.filter(b => !a.contains(b)).map(b => ({ t: b.textContent.trim(), r: b.getBoundingClientRect() }));
      for (const i of inner) for (const o of outer) if (hit(i, o.r)) result.push({ alert: a.textContent.trim().slice(0, 60), retryOverlaps: o.t });
    }
    return { overflow: document.documentElement.scrollWidth > innerWidth, result, hasLimitText: /(\d+)\s*(photos|장|фото)/i.test(document.body.innerText) && false };
  });
}

try {
  for (const width of [390, 1440]) for (const locale of ['ko', 'en', 'ru']) {
    const tag = `${locale}-${width}`;
    const open = async () => { const p = await browser.newPage({ viewport: { width, height: 1000 } }); await p.goto(`http://127.0.0.1:4219/?locale=${locale}`); return p; };
    state.policy = 'ok'; state.postFail = false; state.fail = false;
    let page = await open();
    const photoBtn = page.locator('button[aria-disabled]');
    await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('input[type=file]:not([disabled])'));
    const bodyText = await page.locator('body').innerText();
    const limitLine = await page.locator('small').allInnerTexts();
    await page.screenshot({ path: path.join(out, `A-initial-${tag}.png`), fullPage: true });
    // B: ten photos, press blocked photo button
    await page.locator('input[type=file][accept*=image]').setInputFiles(files(10));
    await page.waitForFunction(() => document.querySelectorAll('img').length >= 10, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('button[aria-disabled=true]:not([disabled])'));
    const aliveBefore = await page.locator('[role=alert]').count();
    await page.locator('button[aria-disabled=true]:not([disabled])').first().click({force:true});
    const alertB = await page.locator('[role=alert]').first().innerText();
    const describedB = await page.locator('button[aria-disabled=true]:not([disabled])').first().getAttribute('aria-describedby');
    const imgsB = await page.locator('img').count();
    await page.screenshot({ path: path.join(out, `B-ten-${tag}.png`), fullPage: true });
    const ovB = await overlap(page);
    await page.close();
    // C: one photo then press blocked video button
    page = await open();
    await page.waitForFunction(() => document.querySelector('input[type=file]:not([disabled])'));
    await page.locator('input[type=file][accept*=image]').setInputFiles(files(1));
    await page.waitForFunction(() => document.querySelectorAll('img').length >= 1 && document.querySelector('button[aria-disabled=true]:not([disabled])'), null, { timeout: 30000 });
    await page.locator('button[aria-disabled=true]:not([disabled])').first().click({force:true});
    const alertC = await page.locator('[role=alert]').first().innerText();
    await page.screenshot({ path: path.join(out, `C-mix-${tag}.png`), fullPage: true });
    const ovC = await overlap(page);
    await page.close();
    // D: attachment policy fails
    state.policy = 'fail';
    page = await open();
    await page.locator('[role=alert]').first().waitFor();
    await page.screenshot({ path: path.join(out, `D-policy-fail-${tag}.png`), fullPage: true });
    const ovD = await overlap(page);
    const alertD = await page.locator('[role=alert]').first().innerText();
    await page.close();
    // E: post save fails
    state.policy = 'ok'; state.postFail = true;
    page = await open();
    await page.waitForFunction(() => document.querySelector('input[type=file]:not([disabled])'));
    const boxes = page.locator('input:not([type]), input[type=text], textarea');
    await boxes.nth(0).fill('Title'); await boxes.nth(1).fill('Body text');
    await page.locator('button[type=submit]').click();
    await page.locator('[role=alert]').first().waitFor();
    await page.screenshot({ path: path.join(out, `E-post-fail-${tag}.png`), fullPage: true });
    const ovE = await overlap(page);
    const alertE = await page.locator('[role=alert]').first().innerText();
    await page.close();
    report.push({ tag, smallTexts: limitLine, alertsBeforeClick: aliveBefore, alertB, describedB, imgsB, alertC, alertD, alertE, ovB, ovC, ovD, ovE });
    console.log(tag, JSON.stringify({ small: limitLine, alertB, describedB: !!describedB, alertC, ovB: ovB.result, ovC: ovC.result, ovD: ovD.result, ovE: ovE.result, of: [ovB.overflow, ovC.overflow, ovD.overflow, ovE.overflow] }));
  }
  await writeFile(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }
