import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('release-notes/images',{recursive:true});
const metrics=[];
const locales=process.argv.includes('--ko-only')?['ko']:['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru'];
for(const locale of locales) for(const width of [390,1440]) {
 await page.setViewportSize({width,height:1000});
 await page.goto('http://127.0.0.1:5272/?state=empty&locale='+locale,{waitUntil:'networkidle'});
 await page.locator('main').waitFor();
 assert.equal(await page.locator('[data-row="artist-ghost"]').count(),0);
 assert.equal(await page.getByText('최애 고르기',{exact:true}).count(),0);
 assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),true);
 metrics.push({locale,width,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,tiles:[...document.querySelectorAll('[data-fan-entity]')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))}))});
 assert.equal(metrics.at(-1).overflow,false);
 if(locale==='ko') await page.screenshot({path:`release-notes/images/2026-11-12-no-pick-${width}.png`,fullPage:true});
 for(const state of ['loading','joined']) {
  await page.goto(`http://127.0.0.1:5272/?state=${state}`,{waitUntil:'networkidle'});
  assert.ok(await page.locator(`[data-row="${state==='loading'?'artist-loading':'artist'}"]`).count()>0);
 }
}
await writeFile(`work/no-pick-placeholder/browser-metrics${process.argv.includes('--ko-only')?'-ko':''}.json`,JSON.stringify(metrics,null,2));
await browser.close();
assert.deepEqual(errors,[]);
console.log(`${metrics.length} locale/viewport combinations: images loaded, no horizontal overflow, loading and joined states pass.`);
