import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..'),out=path.join(repo,'work/pen-dev-loop-20261103/collection-integration/browser');
await fs.mkdir(out,{recursive:true});
const base='http://127.0.0.1:5193',browser=await chromium.launch(),checks=[],pageErrors=[],consoleErrors=[],externalRequests=[];
const files=['group-activities.tsx','creator-group-header.tsx','group-detail.tsx','collection-presentation-copy.ts','group-calendar-label.ts','group-collections.module.css'].map(f=>'apps/web/features/groups/ui/'+f);
const lineage={repository:repo,head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),files:Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await fs.readFile(path.join(repo,f))).digest('hex')])))};
const flush=()=>fs.writeFile(path.join(out,'checks.json'),JSON.stringify({environment:'local synthetic API; actual CelebrityFanPage and GroupDetailScreen; no preview presentation props, no DB access',lineage,checks,pageErrors,consoleErrors,externalRequests},null,2));
let page,context;
async function navigate(caller,locale,width,state='ready',activity=false){
 if(context)await context.close();
 context=await browser.newContext({viewport:{width,height:1400}});page=await context.newPage();
 page.on('pageerror',e=>pageErrors.push({url:page.url(),message:e.message}));
 page.on('console',e=>{if(e.type()==='error')consoleErrors.push({url:page.url(),message:e.text()});});
 await page.route('**/*',route=>{if(!route.request().url().startsWith(base)&&!route.request().url().startsWith('data:')){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`${base}/?caller=${caller}&locale=${locale}&state=${state}${activity?'&activity=collection':''}`);
 await root().waitFor();
 if(['ready','long','page','owner','missing-image'].includes(state))await root().locator('h3').waitFor();
 else if(['error','retry'].includes(state))await root().getByRole('alert').waitFor();
 else if(state==='loading')await root().getByRole('status').waitFor();
 else await root().getByText(await page.evaluate(()=>window.collectionFixture.groups.empty),{exact:true}).waitFor();
 await page.evaluate(()=>document.fonts.ready);
 if(!['missing-image','error','retry','empty','loading'].includes(state))await root().locator('img').evaluate(async img=>{if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});});
}
const root=()=>page.locator('[data-group-collections]');
async function measure(name,{image=true}={}){
 const values=await page.evaluate(()=>({name:window.collectionFixture.name,copy:window.collectionFixture.copy,calendar:window.collectionFixture.calendar}));
 assert.equal(await root().locator(':scope > header h2').textContent(),values.copy.heading.replace('{name}',()=>values.name));
 assert.equal(await root().locator(':scope > header p').textContent(),values.copy.description);
 assert.equal(await page.locator('nav a').filter({hasText:new RegExp('^'+values.calendar+'$')}).count(),1);
 const metrics=await root().evaluate(e=>{
  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const img=e.querySelector('img'),header=e.querySelector('header'),h=e.querySelector('h2'),p=header.querySelector('p'),product=img?.parentElement.parentElement,detail=product?.children[1];
  return {viewport:innerWidth,panel:rect(e),heading:{...rect(h),size:getComputedStyle(h).fontSize,lineHeight:getComputedStyle(h).lineHeight},description:{...rect(p),size:getComputedStyle(p).fontSize,lineHeight:getComputedStyle(p).lineHeight},headingGap:rect(p).y-rect(h).bottom,image:img?{...rect(img),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:getComputedStyle(img).objectFit}:null,productGap:product?getComputedStyle(product).gap:null,detail:detail?rect(detail):null,actions:[...e.querySelectorAll('button,a')].map(n=>({text:n.textContent,...rect(n)})),overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...e.querySelectorAll('h2,h3,p,button,a')].filter(n=>n.clientWidth>0&&n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)};
 });
 assert.equal(metrics.overflow,false,name+' page overflow');assert.deepEqual(metrics.clipped,[],name+' clipped collection text');
 assert.equal(metrics.heading.size,metrics.viewport<768?'20px':'24px');assert.equal(metrics.heading.lineHeight,metrics.viewport<768?'26px':'31px');assert.equal(metrics.description.size,'16px');assert.equal(metrics.description.lineHeight,'25px');assert.equal(metrics.headingGap,20);
 for(const a of metrics.actions)assert.ok(a.width>=44&&a.height>=44,name+' small action '+a.text);
 if(image){if(metrics.viewport===768)assert.ok(metrics.detail.width>=600,name+' readable tablet copy');assert.ok(metrics.image?.naturalWidth>0,name+' loaded image');assert.equal(metrics.image.fit,'contain');assert.ok(Math.abs(metrics.image.width/metrics.image.height-1.5)<0.01,name+' image ratio');if(metrics.viewport===390)assert.ok(Math.abs(metrics.image.width-358)<1,name+' mobile image');if(metrics.viewport===1440)assert.ok(Math.abs(metrics.image.width-600)<1,name+' desktop image');}
 const screenshot=path.join(out,name+'.png');await page.screenshot({path:screenshot,fullPage:true});
 const panelScreenshot=path.join(out,name+'-collection.png');await root().screenshot({path:panelScreenshot});
 checks.push({name,url:page.url(),viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),metrics,screenshot,panelScreenshot,requests:await page.evaluate(()=>window.collectionFixture.requests)});await flush();
}
try{
 await navigate('creator','ko',390);const locales=await page.evaluate(()=>window.collectionFixture.locales);
 for(const caller of ['creator','group'])for(const width of [390,1440])for(const locale of locales){
  await navigate(caller,locale,width);await measure(`${caller}-${locale}-${width}`);
  const copy=await page.evaluate(()=>window.collectionFixture.copy);
  const a=root().getByRole('link',{name:copy.seller});assert.equal(await a.getAttribute('href'),'https://shop.example/item?original=1#product');assert.equal(await a.getAttribute('target'),'_blank');assert.ok((await a.getAttribute('rel')).includes('noopener'));
  assert.equal(await root().locator('button').count(),2,'No invented category controls');
  assert.equal(await root().locator('h3').textContent(),'Original  product title');
  const axe=await new AxeBuilder({page}).include('[data-group-collections]').withTags(['wcag2a','wcag2aa']).analyze();assert.deepEqual(axe.violations,[],`${caller}/${locale}/${width} axe`);
 }
 for(const caller of ['creator','group'])for(const width of [390,1440]){
  for(const state of ['long','empty','error','loading']){
   await navigate(caller,'fr',width,state);await measure(`${caller}-${state}-fr-${width}`,{image:state==='long'});
   if(state==='long'){
    await root().locator('p').last().evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
    const action=await root().getByRole('link').boundingBox();assert.ok(action.y>=0&&action.y+action.height<1400-64,'Long-content action remains above fixed navigation after scrolling');
    const screenshot=path.join(out,`${caller}-long-fr-${width}-scrolled.png`);await page.screenshot({path:screenshot});checks.at(-1).scrolledScreenshot=screenshot;await flush();
   }
  }
  await navigate(caller,'ko',width,'retry');await root().getByRole('button',{name:'다시 시도'}).click();await root().locator('h3').waitFor();await measure(`${caller}-retry-ko-${width}`);
  await navigate(caller,'ko',width,'page');await root().getByRole('button',{name:'더 보기'}).click();const next=root().getByRole('button',{name:'Second product'});await next.waitFor();await next.focus();await page.keyboard.press('Enter');assert.equal(await next.getAttribute('aria-pressed'),'true');assert.equal(await root().getByRole('link',{name:'판매처에서 보기'}).count(),0);assert.equal(await next.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');await measure(`${caller}-sold-out-focus-ko-${width}`);
  await root().getByRole('button',{name:'다른 상품 둘러보기'}).click();assert.equal(await root().getByRole('link',{name:'판매처에서 보기'}).count(),1);
  await navigate(caller,'ko',width,'ready',true);await measure(`${caller}-activity-entry-ko-${width}`);
 }
 for(const locale of ['ko','ja','vi','th'])for(const width of [360,768]){await navigate('creator',locale,width);await measure(`creator-${locale}-${width}`);}
 assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);
 console.log(JSON.stringify({captures:checks.length,locales,callers:['CelebrityFanPage → CreatorGroupCollection','GroupDetailScreen → GroupCollections'],pageErrors,consoleErrors,externalRequests,out},null,2));
}finally{await flush();await browser.close();}
