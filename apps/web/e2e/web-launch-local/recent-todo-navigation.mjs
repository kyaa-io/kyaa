import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {APP_LOCALES} from '../../i18n/locales.ts';
const base=process.env.QA_BASE_URL??'http://127.0.0.1:4269';
const out=process.env.QA_OUTPUT??'test-results/recent-todo';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();const results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const locale of APP_LOCALES)for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.goto(`${base}/?view=community&locale=${locale}`);
  const nav=width===390?page.locator('[data-fan-navigation-id="support"]').last():page.locator('[data-fan-navigation-id="support"]').first();
  await expect(nav).toHaveAttribute('href',`/celebrities?locale=${locale}`);await nav.click();
  await expect(page.getByRole('progressbar')).toHaveCount(3);await expect(nav).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(page.locator('[data-fan-navigation-id="fandom"]').first()).toHaveAttribute('href',`/community?locale=${locale}`);
  await expect(page.locator('main a[href^="/support?"]').first()).toHaveAttribute('href',`/support?locale=${locale}&creator=example-1`);
  if(locale==='ko')await page.screenshot({path:`${out}/navigation-final-${width}.png`});
  await page.locator('main a[href^="/support?"]').first().click();
  await expect(page).toHaveURL(/view=support/);await expect(page).toHaveURL(/creator=example-1/);
  results.push({locale,width,path:'community → favorites ranking → selected creator support',overflow:false});
 }
 expect(errors).toEqual([]);await writeFile(`${out}/navigation.json`,JSON.stringify({results,errors},null,2));console.log(`PASS ${results.length} localized navigation cases`);
}finally{await browser.close();}
