import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.KYAA_WAVE_LOCAL_URL??'http://127.0.0.1:4198';
const output=path.resolve(process.env.KYAA_WAVE_OUTPUT??'test-results/kyaa-wave-local');
await mkdir(output,{recursive:true});
const browser=await chromium.launch(); const checks=[];
try {
 const locales=['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr'];
 const matrix=locales.flatMap(locale=>[390,1440].map(width=>({locale,width}))).concat(['ko','ja','vi','th'].flatMap(locale=>[360,768].map(width=>({locale,width}))));
 for(const {locale,width} of matrix) {
  const page=await browser.newPage({viewport:{width,height:width<768?844:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${root}/wena?locale=${locale}`); const modal=page.getByRole('dialog');await expect(modal).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  assert(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth),`${locale}/${width} modal overflow`);
  await modal.getByRole('checkbox').check();await page.keyboard.press('Escape');
  await page.goto(`${root}/wena?locale=${locale}&tab=events&scenario=reserved&auth=1`);
  const detail=page.locator('section[aria-label^="KYAA WAVE"]');await expect(detail).toBeVisible();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${locale}/${width} detail overflow`);
  const creator=detail.locator('header > img').first();assert(await creator.evaluate(i=>i.naturalWidth>0));
  assert.deepEqual(errors,[]);checks.push(`${locale}/${width}: modal and detail fit`);await page.close();
 }
 await writeFile(path.join(output,'locales.json'),JSON.stringify({checks},null,2)); console.log(`${checks.length} locale/viewport checks passed`);
} finally {await browser.close();}
