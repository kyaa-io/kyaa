// Types into the directory search in the synthetic harness and records requests, focus, list size and skeleton flashes. Usage: OUT=<dir> node groups-directory-search-run.mjs
import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const base=process.env.GROUPS_GUIDE_BANNER_BASE??'http://127.0.0.1:3701',out=process.env.OUT;await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),rows=[];
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}});await page.routeWebSocket('**',s=>s.close());
 await page.addInitScript(()=>{window.__skeleton=0;new MutationObserver(()=>{if(document.querySelector('[aria-busy=true][role=status]')&&!document.querySelector('[class*=directoryCard]'))window.__skeleton++;}).observe(document,{subtree:true,childList:true,attributes:true});});
 await page.goto(`${base}/pages/groups?locale=ko`);await page.waitForTimeout(900);
 const cards=()=>page.evaluate(()=>document.querySelectorAll('[class*=directoryCard]').length);
 const api=()=>page.evaluate(()=>(window.__api??[]).filter(u=>u.includes('search=')));
 await page.evaluate(()=>{window.__skeleton=0;});const input=page.getByPlaceholder(/검색/);const before=await cards();
 await input.click();await input.pressSequentially('한강',{delay:80});
 const immediately=(await api()).length;await page.waitForTimeout(150);const early=(await api()).length;
 await page.waitForTimeout(700);const settled=(await api()).length,after=await cards();
 const focused=await page.evaluate(()=>document.activeElement?.tagName==='INPUT'),urlSearch=new URL(page.url()).searchParams.get('search');
 await page.screenshot({path:`${out}/typed-${width}.png`,fullPage:false});
 await input.fill('');await page.waitForTimeout(900);const cleared=await cards(),back=new URL(page.url()).searchParams.get('search');
 const skeleton=await page.evaluate(()=>window.__skeleton);
 const row={width,before,immediately,early,settled,after,focused,urlSearch,cleared,back,skeletonFlashes:skeleton};rows.push(row);console.log(JSON.stringify(row));
 assert.equal(immediately,0);assert.equal(settled,1);assert.ok(after<before);assert.ok(focused);assert.equal(urlSearch,'한강');assert.equal(cleared,before);assert.equal(back,null);assert.equal(skeleton,0,'list skeleton flashed while searching');
 await page.close();}
}finally{await browser.close();}
