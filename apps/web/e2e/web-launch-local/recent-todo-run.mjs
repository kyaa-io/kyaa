import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { APP_LOCALES } from '../../i18n/locales.ts';
const base=process.env.QA_BASE_URL??'http://127.0.0.1:4269';
const out=process.env.QA_OUTPUT??'test-results/recent-todo';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const results=[];
async function geometry(){return page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));}
async function check(view,locale,width){
  await page.setViewportSize({width,height:900});
  await page.goto(`${base}/?view=${view}&locale=${locale}`);
  await expect(page.locator('main h1')).toHaveCount(1);
  if(view==='directory'){
    await expect(page.getByRole('progressbar')).toHaveCount(3);
    expect(await page.getByRole('progressbar').first().getAttribute('aria-valuenow')).toBe('100');
    const order=await page.locator('main').evaluate(el=>[...el.querySelectorAll('section')].map(s=>s.getAttribute('aria-labelledby')));
    expect(order.indexOf('favorite-support-heading')).toBeLessThan(order.indexOf('directory-heading'));
  }else if(view==='community'){
    await expect(page.getByRole('button',{name:/KYAA LUCKY DRAW/})).toHaveCount(1);
    await expect(page.locator('main')).toContainText('+5P');
  }else{
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await expect(page.locator('#raffle-entry-title')).toBeVisible();
  }
  const size=await geometry();expect(size.scroll).toBeLessThanOrEqual(size.width+1);
  const a11y=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.screenshot({path:`${out}/${view}-${locale}-${width}.png`,fullPage:true});
  results.push({view,locale,width,overflow:false,a11yViolations:0});
}
try{
 for(const view of (process.env.QA_VIEWS?.split(',')??['directory','community','raffle'])){
  for(const locale of APP_LOCALES)for(const width of [390,1440])await check(view,locale,width);
  for(const locale of ['ko','ja','vi','th'])for(const width of [360,768])await check(view,locale,width);
 }
 for(const view of ['directory','community'])for(const state of ['empty','error','loading','unconfigured','long']){
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${base}/?view=${view}&locale=ko&state=${state}`);
  if(state==='long')await expect(page.locator('main')).toContainText('Aleksandra');
  expect((await geometry()).scroll).toBeLessThanOrEqual(390);
  await page.screenshot({path:`${out}/${view}-${state}-390.png`,fullPage:true});
 }
 expect(errors).toEqual([]);
 await writeFile(`${out}/matrix.json`,JSON.stringify({results,errors},null,2));
 console.log(`PASS ${results.length} locale/viewport cases, 10 edge states, zero WCAG A/AA violations or runtime errors`);
}finally{await browser.close();}
