const { chromium } = require('playwright');
const T = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/STAGING-OPERATOR-1/';
(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://127.0.0.1:5197/admin/operators');
    await page.waitForSelector('table, [class*=stateMessage]');
    await page.fill('input[type=email]', 'missing-user@example.test');
    await page.click('button[type=submit]');
    await page.waitForSelector('[role=alert]');
    out.push(width + ' error: ' + (await page.textContent('[role=alert]')));
    await page.fill('input[type=email]', 'synthetic-operator-3@example.test');
    await page.click('button[type=submit]');
    await page.waitForSelector('[role=status]:has-text("지정했습니다")');
    out.push(width + ' grant ok rows: ' + (await page.locator('tbody tr').count()));
    await page.screenshot({ path: T + 'grants-after-grant-' + width + '.png' });
    await page.fill('input[type=email]', 'synthetic-operator-3@example.test');
    await page.click('button[type=submit]');
    await page.waitForSelector('[role=status]:has-text("이미 지정")');
    out.push(width + ' replay ok');
    await page.locator('button:has-text("해지")').first().click();
    await page.waitForSelector('[role=alertdialog], [role=dialog]');
    await page.screenshot({ path: T + 'grants-confirm-' + width + '.png' });
    await page.locator('[role=alertdialog] button:has-text("해지"), [role=dialog] button:has-text("해지")').last().click();
    await page.waitForSelector('[role=status]:has-text("해지했습니다")');
    out.push(width + ' revoked; active buttons left: ' + (await page.locator('tbody button:has-text("해지")').count()));
    await page.screenshot({ path: T + 'grants-after-revoke-' + width + '.png' });
    await page.close();
  }
  const v = await browser.newPage({ viewport: { width: 1440, height: 700 } });
  await v.goto('http://127.0.0.1:5197/admin/operators?role=viewer');
  await v.waitForTimeout(800);
  out.push('viewer shows form: ' + (await v.locator('input[type=email]').count()));
  await v.screenshot({ path: T + 'grants-viewer-1440.png' });
  await browser.close();
  console.log(out.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
