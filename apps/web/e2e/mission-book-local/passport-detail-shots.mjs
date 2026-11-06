// Captures the passport detail at the stamp counts and widths the contract names. Synthetic auth and API, real components and CSS.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { startHarness } from './server.mjs';
const out = process.env.PASSPORT_SHOTS ?? 'test-results/passport-detail';
await mkdir(out, { recursive: true });
const harness = await startHarness(Number(process.env.MISSION_BOOK_PORT ?? 3611));
const browser = await chromium.launch();
const cases = [['0', 'stamps=0'], ['1', 'stamps=1'], ['9', 'stamps=9'], ['10', 'stamps=10&tier=gold'], ['27', 'stamps=27&tier=top'], ['long-en', 'stamps=4&locale=en&name=Aleksandra%20Wisniewska%20Kowalczyk%20the%20Second&creator=RUN%26MUSIC%20FESTIVAL%20SEOUL'], ['ru', 'stamps=4&locale=ru'], ['th', 'stamps=4&locale=th&tier=gold']];
const problems = [];
try {
  for (const width of [320, 390, 768, 1440]) for (const [name, query] of cases) {
    if ((width === 320 || width === 768) && !['1', 'long-en', 'ru', 'th'].includes(name)) continue;
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${harness.baseURL}/?view=detail&${query}`);
    await page.waitForSelector('[data-passport-book]', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('[data-passport-book] ol li'), null, { timeout: 15000 }).catch(() => problems.push(`${name}/${width}: no slots`));
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth, clipped: [...document.querySelectorAll('[data-passport-book] :is(dd,strong,span,h3), [data-fan-tier-journey] :is(strong,span,h2)')].filter(el => el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline' && !el.hasAttribute('aria-hidden')).slice(0, 4).map(el => el.textContent.slice(0, 24)), small: [...document.querySelectorAll('[data-passport-book] button')].filter(el => el.getBoundingClientRect().height < 44 || el.getBoundingClientRect().width < 44).length, fill: getComputedStyle(document.querySelector('[data-fan-tier-journey] ol')).getPropertyValue('--tier-fill') }));
    if (m.scroll > m.inner) problems.push(`${name}/${width}: page overflow ${m.scroll}`);
    if (m.clipped.length) problems.push(`${name}/${width}: clipped ${m.clipped.join('|')}`);
    if (m.small) problems.push(`${name}/${width}: ${m.small} small buttons`);
    if (errors.length) problems.push(`${name}/${width}: ${errors[0]}`);
    await page.screenshot({ path: `${out}/detail-${name}-${width}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser.close(); await harness.server.close(); }
console.log(problems.length ? problems.join('\n') : 'no problems');
process.exit(problems.length ? 1 : 0);
