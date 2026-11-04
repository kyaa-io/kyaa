import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('e2e/groups-benefits-local/evidence'),base='http://127.0.0.1:5196',id='10000000-0000-4000-8000-000000000001';
const browser=await chromium.launch(),page=await browser.newPage(),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
for(const locale of ['ko','ja','vi','th'])for(const width of [360,768])for(const [surface,route]of Object.entries({benefits:'/benefits',capsule:'/my/capsules',raffle:`/pages/groups/${id}/raffles/${id}`})){
 await page.setViewportSize({width,height:1000});await page.goto(`${base}${route}?locale=${locale}`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,radios:[...document.querySelectorAll('label:has(input[type=radio])')].map(e=>({labelBottom:e.querySelector('span').getBoundingClientRect().bottom,metaTop:e.querySelector('small').getBoundingClientRect().top}))}));
 const file=path.join(out,`responsive-${surface}-${locale}-${width}.png`);await page.screenshot({path:file,fullPage:true});results.push({surface,locale,width,url:page.url(),screenshot_path:file,metrics});
}
const failures=results.filter(r=>r.metrics.scroll>r.width||r.metrics.radios.some(x=>x.labelBottom>x.metaTop));await writeFile(path.join(out,'responsive-checks.json'),JSON.stringify({count:results.length,failures,errors,results},null,2));console.log(JSON.stringify({count:results.length,failures,errors}));await browser.close();if(failures.length||errors.length)process.exitCode=1;
