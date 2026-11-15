import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {for(const width of [390,1440])for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru']){
 const page=await browser.newPage({viewport:{width,height:900}});await page.goto(`http://127.0.0.1:4238?locale=${locale}`);await page.locator('[data-fan-post-row]').first().waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${locale} ${width} overflow`);
 const rows=await page.locator('[data-fan-post-row]').evaluateAll(rows=>rows.map(row=>{const meta=row.lastElementChild,title=row.querySelector('a');return {right:meta.getBoundingClientRect().right,rowRight:row.getBoundingClientRect().right,align:getComputedStyle(meta).justifyContent,ellipsis:getComputedStyle(title).textOverflow};}));
 assert.equal(await page.locator('[data-count=likes]').count(),3);
 assert.equal(await page.locator('[data-artist-reacted]').count(),1);
 assert.equal(await page.locator('[data-fan-post-row] > div:last-child [data-count=likes]').count(),0);
 for(const row of rows){assert.equal(row.ellipsis,'ellipsis');if(width===1440){assert.equal(row.align,'flex-end');assert(Math.abs(row.right-row.rowRight)<1);}}
 if(width===1440){const xs=await page.evaluate(()=>{const left=(e)=>e?Math.round(e.getBoundingClientRect().left):null;const rows=[...document.querySelectorAll('[data-fan-post-row]')];const pick=(sel)=>[...new Set(rows.map(r=>left(r.lastElementChild.querySelector(sel))).filter(v=>v!==null))];return {source:pick(':scope > a'),author:pick(':scope > span'),time:pick('time')};});
  for(const [name,values] of Object.entries(xs))assert.equal(values.length,1,`${locale} ${name} 열 시작 x가 줄마다 다름: ${values}`);}
 await page.close();
}console.log('PASS 12 locales × 390/1440: overflow, metadata right edge, title ellipsis, 1440 source·author·time column x');}finally{await browser.close();}
