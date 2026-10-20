import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startHarness } from './server.mjs';
const out=process.env.WAVE_EVIDENCE_DIR || 'test-results/wave-programs-local';
await mkdir(out,{recursive:true});
const harness=await startHarness(4198), browser=await chromium.launch(), checks=[];
try {
 for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr']) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}), page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${harness.baseURL}/kyaa-wave-fanpage?locale=${locale}&auth=off`);
  await expect(page.locator('ol a[href*="/programs/"]')).toHaveCount(3);
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'home overflow');
  if(locale==='ko') {await page.screenshot({path:`${out}/home-${width}.png`,fullPage:true});const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  assert.deepEqual(errors,[]);checks.push(`home ${locale} ${width}`);await context.close();
 }
 for(const program of ['live-insight','wave-quiz','community-starts']) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}), page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${harness.baseURL}/kyaa-wave-fanpage/programs/${program}?locale=ko`);
  await expect(page.getByText('함께 나눈 이야기를 사진으로 남겨요.',{exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'program overflow');await page.screenshot({path:`${out}/${program}-${width}.png`,fullPage:true});
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  assert.deepEqual(errors,[]);checks.push(`program ${program} ${width}`);await context.close();
 }
 await writeFile(`${out}/evidence.json`,JSON.stringify({boundary:'Actual UI and CSS with loopback synthetic auth/API and example photo. Database tested separately.',checks},null,2));console.log(checks.join('\n'));
} finally {await browser.close();await harness.server.close();}
