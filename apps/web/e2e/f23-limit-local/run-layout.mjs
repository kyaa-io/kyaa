import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { startHarness, state } from './server.mjs';

const out = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/F23-COMPOSER-390';
await mkdir(out, { recursive: true });
const jpg = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#d6a6ee' } }).jpeg().toBuffer();
const files = n => Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: jpg }));
const video = { name: 'v.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not-a-real-video') };
const server = await startHarness(), browser = await chromium.launch(), report = [];

const measure = page => page.evaluate(() => {
  const vw = innerWidth, docW = document.documentElement.scrollWidth;
  const hid = e => { const c = getComputedStyle(e); return c.visibility === 'hidden' || c.display === 'none' || +c.opacity === 0 || c.clipPath !== 'none' || (c.clip && c.clip !== 'auto') || (e.offsetWidth <= 1 && e.offsetHeight <= 1) || e.type === 'file' && c.position === 'absolute'; };
  const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 0.5 && !hid(e) && !(e.closest('[hidden]')); }).map(e => `${e.tagName}.${String(e.className).slice(0, 30)}:${Math.round(e.getBoundingClientRect().right)}`).slice(0, 5);
  const hiddenInputs = [...document.querySelectorAll('input[type=file]')].map(i => { const c = getComputedStyle(i); return `${c.position}/${c.opacity}/${c.display}/${Math.round(i.getBoundingClientRect().width)}`; });
  const broken = [];
  for (const b of document.querySelectorAll('button')) { if (!b.offsetParent) continue; const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); if (!t || /\s/.test(t)) continue; const r = document.createRange(); r.selectNodeContents(n); if (new Set([...r.getClientRects()].map(q => Math.round(q.top))).size > 1) broken.push(t); } }
  const thumbs = [...document.querySelectorAll('figure')].map(f => Math.round(f.getBoundingClientRect().width) + 'x' + Math.round(f.getBoundingClientRect().height));
  const form = document.querySelector('form').getBoundingClientRect();
  const alerts = [...document.querySelectorAll('[role=alert]')].map(a => ({ w: Math.round(a.getBoundingClientRect().width), formW: Math.round(form.width) }));
  return { hiddenInputs, vw, docW, docOverflow: docW > vw, wide, broken, thumbs, alerts };
});

try {
  for (const width of [390, 360, 1440]) for (const locale of ['ko', 'en', 'ru']) {
    const tag = `${locale}-${width}`;
    const open = async () => { const p = await browser.newPage({ viewport: { width, height: 1000 } }); await p.goto(`http://127.0.0.1:4219/?locale=${locale}`); await p.waitForFunction(() => document.querySelector('input[type=file]:not([disabled])')); return p; };
    state.policy = 'ok'; state.postFail = false; state.fail = false;
    const row = { tag };
    let page = await open();
    row.s0 = await measure(page);
    await page.screenshot({ path: path.join(out, `s0-${tag}.png`), fullPage: true });
    await page.locator('input[type=file][accept*=image]').setInputFiles(files(1));
    await page.waitForFunction(() => document.querySelectorAll('figure img').length >= 1, null, { timeout: 30000 });
    row.s1 = await measure(page);
    await page.screenshot({ path: path.join(out, `s1-${tag}.png`), fullPage: true });
    await page.close();
    page = await open();
    await page.locator('input[type=file][accept*=image]').setInputFiles(files(10));
    await page.waitForFunction(() => document.querySelectorAll('figure img').length >= 10, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('button[aria-disabled=true]:not([disabled])'));
    await page.locator('button[aria-disabled=true]:not([disabled])').first().click({ force: true });
    row.s10err = await measure(page);
    row.dim = await page.locator('button[aria-disabled=true]').first().evaluate(b => ({ opacity: getComputedStyle(b).opacity, cursor: getComputedStyle(b).cursor, inline: b.getAttribute('style') }));
    await page.screenshot({ path: path.join(out, `s10err-${tag}.png`), fullPage: true });
    await page.close();
    // video then press blocked photo button
    page = await open();
    await page.locator('input[type=file][accept*=video]').setInputFiles(video);
    await page.waitForFunction(() => document.querySelector('button[aria-disabled=true]:not([disabled])'), null, { timeout: 15000 });
    const btns = page.locator('button[aria-disabled=true]:not([disabled])');
    const labels = await btns.allInnerTexts();
    // the photo button is the first picker button
    const photoBtn = page.locator('button:not([disabled])').filter({ hasText: /./ }).first();
    row.videoBlockedLabels = labels;
    await btns.first().click({ force: true });
    await page.waitForFunction(() => document.querySelector('[role=alert]'), null, { timeout: 5000 });
    row.videoAlert = await page.locator('[role=alert]').first().innerText();
    row.videoPhotoInputDisabled = await page.locator('input[type=file][accept*=image]').isDisabled();
    row.video = await measure(page);
    await page.screenshot({ path: path.join(out, `video-${tag}.png`), fullPage: true });
    await page.close();
    report.push(row);
    const bad = k => row[k] && (row[k].docOverflow || row[k].wide.length || row[k].broken.length);
    console.log(tag, JSON.stringify({ bad: ['s0', 's1', 's10err', 'video'].filter(bad), thumbs1: row.s1.thumbs, thumbs10: row.s10err.thumbs.slice(0, 2), alerts: row.s10err.alerts, dim: row.dim, videoAlert: row.videoAlert, wide: row.s1.wide }));
  }
  await writeFile(path.join(out, 'layout-report.json'), JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }
