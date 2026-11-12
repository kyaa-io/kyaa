import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.cwd()+'/board/tasks/fb-1112/captures';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const results=[];
for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru'])for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:4197/?view=guide&locale=${locale}`);await expect(page.locator('[data-tier-stage]')).toHaveCount(11);await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 const dims=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,images:[...document.images].map(i=>({src:i.getAttribute('src'),width:i.width,height:i.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight}))}));if(dims.overflow||errors.length)throw Error(JSON.stringify({locale,width,dims,errors}));
 if(locale==='ko')await page.screenshot({path:`${out}/guide-${width}.png`,fullPage:true});results.push({locale,width,...dims,errors});await context.close();}
await writeFile(process.cwd()+'/board/tasks/fb-1112/browser-results.json',JSON.stringify(results,null,2));await browser.close();console.log('24 guide viewport/language checks passed');
