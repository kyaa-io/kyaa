import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:1000});
  for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru']) {
   await page.goto(`http://127.0.0.1:3128/?view=wallet&locale=${locale}`);
   await page.locator('ol li').first().waitFor();
   assert.equal(await page.locator('ol li').count(),30);
   assert.equal(await page.locator('ol li[data-complete="true"]').count(),6);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${locale}/${width}: overflow`);
   const rows=await page.locator('ol li').evaluateAll(nodes=>nodes.slice(0,7).map(node=>{const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,width:box.width};}));
   assert.ok(rows.every(row=>Math.abs(row.top-rows[0].top)<1&&Math.abs(row.bottom-rows[0].bottom)<1),`${locale}/${width}: calendar alignment`);
   assert.ok(rows.every(row=>row.width>=35));
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS wallet: 12 locales x 390/1440, real calendar dates/stamps, aligned rows, no overflow or page errors');
} finally {await browser.close();}
