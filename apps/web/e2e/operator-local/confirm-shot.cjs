const { chromium } = require('playwright');
const T = '/Users/jewel/Desktop/Developement/byus-groups-production-20261101/work/local-team-20261103/tasks/STAGING-OPERATOR-1/';
(async () => {
  const b = await chromium.launch();
  for (const w of [390, 1440]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto('http://127.0.0.1:5197/admin/operators');
    await p.waitForSelector('table, [class*=stateMessage]');
    await p.locator('tbody button').first().click();
    await p.waitForTimeout(700);
    await p.screenshot({ path: T + 'grants-confirm-' + w + '.png' });
  }
  await b.close();
})();
