import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_LOCALES } from '../../i18n/locales.ts';
import { participationCopy } from '../../features/connect/kyaa-wave-participation-copy.ts';
import { startHarness } from './server.mjs';

const output = process.env.KYAA_PARTICIPATION_QA_OUTPUT ?? path.resolve('test-results/kyaa-wave-participation');
await mkdir(output, { recursive: true });
const harness = await startHarness(4198);
const browser = await chromium.launch({ headless: true });
const results = [];
const route = '/connect/kyaa-wave/participate';
const code = 'WAVE-ABCD-EFGH';
try {
 for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.route("**/*", intercepted => new URL(intercepted.request().url()).origin === harness.baseURL ? intercepted.continue() : intercepted.abort());
  const page = await context.newPage();
  const url = (query = {}) => `${harness.baseURL}${route}?${new URLSearchParams({ code, locale: 'ko', ...query })}`;
  for (const locale of APP_LOCALES) {
   await page.goto(url({ locale }));
   await expect(page.locator('input[name="name"]')).toBeVisible();
   await page.locator('input[name="name"]').fill('테스트 참여자');
   if (locale === 'ko') {
    await page.keyboard.press('Tab');
    await expect(page.locator('#participation-code')).toBeFocused();
    expect(await page.locator('#participation-code').evaluate(node => Number.parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
    await page.locator('input[name="name"]').focus();
   }
   const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, font: getComputedStyle(document.querySelector('input')).fontSize }));
   expect(metrics.overflow).toBe(false);
   expect(Number.parseFloat(metrics.font)).toBeGreaterThanOrEqual(16);
   if (locale === 'ko' || locale === 'en') {
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: path.join(output, `name-${locale}-${width}.png`), fullPage: true });
   }
   await page.locator('button[type="submit"]').click();
   await expect(page.locator('input[name="name"]')).toHaveCount(0);
   await expect(page).toHaveURL(/\/kyaa-wave-fanpage\?locale=/);
   if (locale === 'ko') await page.screenshot({ path: path.join(output, `completed-${width}.png`), fullPage: true });
   results.push({ locale, width, scenario: 'direct-name-code-save-redirect', pass: true });
  }
  for (const [scenario, message] of [['invalid', '참여 코드를 확인'], ['rate', '잠시'], ['closed', '종료'], ['retry', '잠시']]) {
   await page.goto(url({ scenario }));
   await page.locator('input[name="name"]').fill('테스트 참여자');
   await page.locator('button[type="submit"]').click();
   await expect(page.getByRole('alert')).toBeVisible();
   await expect(page.locator('input[name="name"]')).toHaveValue('테스트 참여자');
   await expect(page.getByRole('alert')).toContainText(message);
   if (scenario === 'retry') {
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/kyaa-wave-fanpage\?locale=/);
   }
   results.push({ width, scenario, messageChecked: message, pass: true });
  }
  for (const phase of ['load', 'submit']) {
   for (const status of [401, 403]) {
    const scenario = `${phase}-auth-${status}`, locale = 'ja';
    const returnTo = '/kyaa-wave-fanpage?locale=ja&tab=friends';
    await page.goto(url({ scenario, locale, returnTo, code: 'abcd-23' }));
    if (phase === 'submit') {
     await page.locator('input[name="name"]').fill('テスト参加者');
     await page.locator('#participation-code').fill('ABCD24');
     await page.locator('button[type="submit"]').click();
    }
    await expect(page.getByRole('alert')).toHaveText(participationCopy[locale].auth);
    expect(new URL(page.url()).pathname).toBe(route);
    const login = page.getByRole('link', { name: participationCopy[locale].login, exact: true });
    await expect(login).toBeVisible();
    await expect(page.getByRole('button', { name: participationCopy[locale].retry, exact: true })).toHaveCount(0);
    if (phase === 'submit') {
     await expect(page.locator('input[name="name"]')).toHaveValue('テスト参加者');
     await expect(page.locator('#participation-code')).toHaveValue('ABCD24');
     await expect(page.locator('button[type="submit"]')).toHaveCount(0);
    }
    await login.focus(); await expect(login).toBeFocused();
    expect(await login.evaluate(node => Number.parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: path.join(output, `${scenario}-${width}.png`), fullPage: true });
    await login.press('Enter'); await expect(page).toHaveURL(/\/login\?/);
    const loginUrl = new URL(page.url());
    expect(loginUrl.searchParams.get('locale')).toBe(locale);
    const checkin = new URL(loginUrl.searchParams.get('returnTo'), loginUrl.origin);
    expect(checkin.pathname).toBe(route);
    expect(checkin.searchParams.get('code')).toBe(phase === 'submit' ? 'ABCD24' : 'ABCD23');
    expect(checkin.searchParams.get('locale')).toBe(locale);
    expect(checkin.searchParams.get('returnTo')).toBe(returnTo);
    results.push({ width, locale, scenario, pass: true });
   }
  }
  await page.goto(url({ scenario: 'already' }));
  await expect(page).toHaveURL(/\/kyaa-wave-fanpage\?locale=/);
  await expect(page.locator('input')).toHaveCount(0);
  await page.goto(url({ scenario: 'restoring' }));
  await expect(page.getByRole('status')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(route);
  await expect(page.locator('input')).toHaveCount(0);
  await page.goto(url({ auth: 'off', locale: 'en' }));
  await expect(page).toHaveURL(/\/login\?/);
  const destination = new URL(page.url()).searchParams.get('returnTo');
  expect(destination).toContain(route);
  expect(destination).toContain('code=WAVEABCDEFGH');
  expect(destination).toContain('locale=en');
  await page.goto(`${harness.baseURL}${route}?auth=off&locale=ko`);
  await expect(page).toHaveURL(/\/login\?/);
  await page.goto(`${harness.baseURL}${route}?locale=ko`);
  await expect(page.locator('#participation-code')).toHaveValue('');
  await page.locator('input[name="name"]').fill('테스트 참여자');
  await page.locator('#participation-code').fill(code);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/kyaa-wave-fanpage\?locale=/);
  results.push({ width, scenario: 'existing-restoring-QR-login-manual-login', pass: true });
  await page.goto(url({ view: 'admin' }));
  await expect(page.getByText('테스트 참여자', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
  results.push({ width, scenario: 'admin-participant-list', pass: true });
  await context.close();
 }
 await writeFile(path.join(output, 'results.json'), JSON.stringify({ fixture: true, realComponent: true, results }, null, 2));
 console.log(`PASS ${results.length} browser scenarios; ${APP_LOCALES.length} locales; 390/1440px; WCAG audit KO/EN. Evidence: ${output}`);
} finally {
 await browser.close();
 await harness.server.close();
}
