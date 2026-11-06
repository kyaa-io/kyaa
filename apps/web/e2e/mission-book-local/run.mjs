// Measures the mission book and proof screens at the section 15 widths and locales. Numbers go to stdout; only requested captures are written.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { startHarness } from './server.mjs';
import { APP_LOCALES } from '../../i18n/locales.ts';

const port = Number(process.env.MISSION_BOOK_PORT ?? 3510), out = process.env.MISSION_BOOK_OUTPUT;
if (out) await mkdir(out, { recursive: true });
const harness = await startHarness(port);
const browser = await chromium.launch();
const failures = [];
let measured = 0;
const fail = (where, what) => failures.push(`${where}: ${JSON.stringify(what)}`);
async function open(path, width, height = 1000, options = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${harness.baseURL}/?${path}`);
  await page.waitForFunction(() => document.querySelector('#fixture h2, #fixture article'), null, { timeout: 60000 });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}
// content wider than the viewport, or an element running past the right edge
const overflow = page => page.evaluate(() => {
  const limit = innerWidth;
  const wide = [...document.querySelectorAll('#fixture *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > limit + 0.5; });
  const clippedText = [...document.querySelectorAll('#fixture span, #fixture h2, #fixture h3, #fixture p, #fixture a, #fixture button')].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline');
  return { scroll: document.documentElement.scrollWidth, inner: limit, wide: wide.slice(0, 3).map(el => el.className || el.tagName), clipped: clippedText.slice(0, 3).map(el => `${el.className}:${el.textContent.slice(0, 18)}`) };
});
const views = process.env.MISSION_BOOK_VIEWS?.split(',') ?? ['view=mission&scenario=locked', 'view=mission&scenario=open', 'view=proofs', 'view=passports&data=mixed'];
for (const view of views) {
  for (const locale of APP_LOCALES) {
    const widths = ['ko', 'ja', 'vi', 'th'].includes(locale) ? [320, 360, 390, 768, 1440] : [320, 390, 1440];
    for (const width of widths) {
      const { context, page, errors } = await open(`${view}&locale=${locale}`, width);
      const m = await overflow(page);
      measured += 1;
      if (m.scroll > m.inner || m.wide.length) fail(`${view} ${locale} ${width} overflow`, m);
      if (m.clipped.length) fail(`${view} ${locale} ${width} clipped`, m.clipped);
      if (errors.length) fail(`${view} ${locale} ${width} errors`, errors);
      if (out && (locale === 'ko' || locale === 'th') && (width === 390 || width === 1440)) await page.screenshot({ path: `${out}/${view.replace(/\W+/g, '-')}-${locale}-${width}.png`, fullPage: true });
      await context.close();
    }
  }
}
// 200 percent zoom: 720 CSS px from a 1440 window, 195 from a 390 phone. 195 is below the 320 floor in globals.css and is reported, not failed.
const zoom = {};
for (const view of ['view=mission&scenario=locked', 'view=proofs']) {
  for (const width of [720, 195]) {
    const { context, page } = await open(`${view}&locale=ko`, width);
    const m = await page.evaluate(() => ({ bodyWidth: document.body.getBoundingClientRect().width, htmlOverflow: getComputedStyle(document.documentElement).overflowX, inner: innerWidth, scroll: document.documentElement.scrollWidth }));
    zoom[`${view} ${width}`] = m;
    if (width === 720 && m.bodyWidth > 720) fail(`${view} 720`, m);
    await context.close();
  }
}
// keyboard, focus, motion and axe on the real states
const a11y = {};
{
  const { context, page, errors } = await open('view=mission&scenario=open&locale=ko', 1440, 1000, { reducedMotion: 'reduce' });
  const stops = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => { const el = document.activeElement; const style = getComputedStyle(el); return { tag: el.tagName, text: el.textContent.trim().slice(0, 20), disabled: el.disabled ?? false, outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0, shadow: style.boxShadow !== 'none' }; }));
  }
  a11y.tabStops = stops;
  a11y.motionReduced = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && (a.effect?.getComputedTiming().iterations === Infinity || a.effect?.getComputedTiming().duration > 0)).length);
  a11y.states = await page.locator('[role="checkbox"]').evaluateAll(els => els.reduce((n, el) => { n[el.getAttribute('aria-checked')] = (n[el.getAttribute('aria-checked')] ?? 0) + 1; return n; }, {}));
  a11y.axeMissionOpen = (await new AxeBuilder({ page }).include('#fixture').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  const claim = page.getByRole('button', { name: '하트 받기' }).first();
  await claim.focus();
  a11y.claimEnterKey = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (errors.length) fail('a11y errors', errors);
  await context.close();
}
{
  const { context, page } = await open('view=mission&scenario=locked&locale=ko', 390);
  a11y.lockedTab = [];
  for (let i = 0; i < 2; i += 1) { await page.keyboard.press('Tab'); a11y.lockedTab.push(await page.evaluate(() => `${document.activeElement.tagName}:${document.activeElement.textContent.trim().slice(0, 20)}`)); }
  a11y.disabledClaim = await page.getByRole('button', { name: '하트 받기' }).first().evaluate(el => ({ disabled: el.disabled, described: document.getElementById(el.getAttribute('aria-describedby'))?.textContent }));
  a11y.checkinLabel = await page.locator('[data-kind="checkin"] [role="checkbox"]').getAttribute('aria-label');
  a11y.axeMissionLocked = (await new AxeBuilder({ page }).include('#fixture').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  await context.close();
}
{
  const { context, page } = await open('view=proofs&locale=ko', 390);
  a11y.axeProofs = (await new AxeBuilder({ page }).include('#fixture').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  await context.close();
}
console.log(JSON.stringify({ measured, zoom, a11y, failures: failures.length }, null, 1));
for (const line of failures.slice(0, 40)) console.log(line);
await browser.close();
await harness.server.close();
process.exit(0);
