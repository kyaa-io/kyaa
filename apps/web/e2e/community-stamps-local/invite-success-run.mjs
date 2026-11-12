import { chromium, expect } from '@playwright/test';
import { startHarness } from './server.mjs';
const harness = await startHarness();
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.route('**/api/community-stamps/**', route => route.fulfill({ json: route.request().url().endsWith('/invite-code')
      ? { code: 'ABCDEF123456', redeemed: false, redemptionState: 'none' }
      : { state: 'qualified_reward_issued' } }));
    await page.goto(`${harness.baseURL}/?view=invite-success&locale=ko`);
    await page.getByRole('button', { name: '내 초대코드' }).click({timeout:5000});
    await expect(page.getByText('ABCDEF123456')).toBeVisible();
    await page.locator('#community-friend-code').fill('FRIEND123');
    await page.getByRole('button', { name: '코드 인증' }).click();
    await expect(page.getByText('친구 코드 인증을 완료했어요.')).toBeVisible();
    await expect(page.getByText('완료하지 못했어요. 다시 시도해 주세요.')).toHaveCount(0);
    await page.screenshot({ path: `release-notes/images/2026-11-12-report1112-b8-${width}.png`, fullPage: true });
    console.log(`${width}: success displayed, no failure`);
    await page.close();
  }
} finally { await browser.close(); await harness.server.close(); }
