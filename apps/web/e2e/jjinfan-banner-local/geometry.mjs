import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const records=[];
try{
 for(const width of [390,1440,360,768]){
  const locales=width===360||width===768?['ko','ja','vi','th']:['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru'];
  for(const locale of locales)for(const view of ['home','modal']){
   const page=await browser.newPage({reducedMotion:'reduce',viewport:{width,height:900}});
   await page.goto(`http://localhost:4217/${view==='modal'?'yuna':''}?locale=${locale}${view==='modal'?'&challenge=jjinfan100':''}`);
   const selector=view==='home'?'[data-compact] article[data-active=true] a':'[role=dialog]';
   await page.locator(selector).waitFor();await page.evaluate(()=>document.fonts.ready);
   const record=await page.locator(selector).evaluate((c,view)=>{const b=c.getBoundingClientRect(),texts=[...c.querySelectorAll(view==='home'?'span,h2':'h2,button')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}));return {overflow:document.documentElement.scrollWidth-innerWidth,bounds:b.toJSON(),texts,ok:texts.every(t=>t.rect.top>=b.top&&t.rect.bottom<=b.bottom&&t.rect.left>=b.left&&t.rect.right<=b.right)};},view);
   assert.equal(record.overflow,0,`${width}/${locale}/${view} overflow`);assert(record.ok,`${width}/${locale}/${view} bounds`);records.push({width,locale,view,...record});await page.close();
  }
 }
 await writeFile(new URL('../../../../work/jjinfan-banner/locale-geometry.json',import.meta.url),JSON.stringify(records,null,2));console.log(JSON.stringify({pass:true,cases:records.length}));
}finally{await browser.close();}
