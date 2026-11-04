import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..'),out=path.join(here,'evidence');
await fs.mkdir(out,{recursive:true});
const base='http://127.0.0.1:5191',group='10000000-0000-4000-8000-000000000001',list=`/pages/groups/${group}/earnings`,detail=`${list}/${encodeURIComponent('activity:10000000-0000-4000-8000-000000000003')}`;
const browser=await chromium.launch(),checks=[],errors=[],consoleErrors=[],externalRequests=[];
let context,page;
async function freshPage(width){
 if(context)await context.close();
 context=await browser.newContext({viewport:{width,height:1100}});page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:'+base)&&!r.url().startsWith('data:'))externalRequests.push(r.url());});
}
await freshPage(390);
const root=()=>page.locator('[data-group-earnings],[data-group-earning-result]');
const flush=()=>fs.writeFile(path.join(out,'checks.json'),JSON.stringify({environment:'Chromium, synthetic local fixtures; real production UI and resource helper',checks,errors,consoleErrors,externalRequests},null,2));
async function navigate(route,state,locale='ko'){
 await page.goto(`${base}${route}?locale=${locale}&state=${state}`);
 await root().waitFor();
 if(['ready','long','all','page','nullable'].includes(state))await root().locator('h2').first().waitFor();
 else if(['error','forbidden','missing','malformed'].includes(state))await root().getByRole('alert').waitFor();
 else if(state==='empty')await root().locator('p').waitFor();
 else if(state==='unauthorized')await root().locator('a[href^="/login"]').waitFor();
 else await root().getByRole('status').waitFor();
 await page.evaluate(()=>document.fonts.ready);
}
async function measure(name,width,capture=true){
 const metrics=await root().evaluate(e=>{
  const rect=e.getBoundingClientRect(),h=e.querySelector('h1'),nav=document.getElementById('celebrity-content');
  return {width:rect.width,x:rect.x,overflow:document.documentElement.scrollWidth>innerWidth,heading:{size:getComputedStyle(h).fontSize,line:getComputedStyle(h).lineHeight,weight:getComputedStyle(h).fontWeight},gap:nav?rect.y-nav.getBoundingClientRect().bottom:null,rows:[...e.querySelectorAll('li')].map(x=>({height:x.getBoundingClientRect().height,status:x.getAttribute('data-status')})),facts:[...e.children].filter(x=>x.querySelector('h2')).map(x=>x.getBoundingClientRect().height),actions:[...e.querySelectorAll('a,button')].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})),clipped:[...e.querySelectorAll('h1,h2,p,strong,a')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.tagName)};
 });
 assert.equal(metrics.overflow,false,name+' horizontal overflow');assert.deepEqual(metrics.clipped,[],name+' clipped text');
 assert.equal(metrics.width,width>=1040?960:width<1024?width-32:width-80,name+' content width');
 assert.equal(metrics.x,(width-metrics.width)/2,name+' centered edges');
 assert.equal(metrics.heading.size,width<768?'24px':'32px');assert.equal(metrics.heading.weight,'400');
 if(metrics.gap!==null)assert.ok(Math.abs(metrics.gap-(width<768?16:32))<=1,name+' header gap');
 for(const a of metrics.actions){assert.ok(a.width>=44&&a.height>=44,name+' target');}
 if(name.startsWith('list-ready-ko-'))assert.deepEqual(metrics.rows.map(x=>x.height),[89,81,89]);
 if(name.startsWith('detail-ready-ko-'))assert.deepEqual(metrics.facts,[81,81,78]);
 const screenshot=capture?`${name}.png`:null;
 if(screenshot)await page.screenshot({path:path.join(out,screenshot),fullPage:true});
 checks.push({name,url:page.url(),viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),metrics,screenshot});await flush();
}
try{
 await navigate(list,'ready');const locales=await page.evaluate(()=>window.earningsFixture.locales);
 assert.equal(locales.length,12);
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1100});
  for(const locale of locales){
   await freshPage(width);
   for(const state of ['ready','all','long','nullable','empty','error','loading']){
    await navigate(list,state,locale);await measure(`list-${state}-${locale}-${width}`,width);
    if(state==='nullable'){assert.equal(await root().locator('strong').count(),0);assert.ok(!(await root().innerText()).includes('0P'));}
    if(state==='ready'){const axe=await new AxeBuilder({page}).include('[data-group-earnings]').withTags(['wcag2a','wcag2aa']).analyze();assert.deepEqual(axe.violations,[],`${locale} list accessibility`);checks.push({name:`axe-list-${locale}-${width}`,violations:axe.violations});}
   }
   for(const state of ['ready','long','error','missing']){
    await navigate(detail,state,locale);await measure(`detail-${state}-${locale}-${width}`,width);
    if(state==='ready'){const axe=await new AxeBuilder({page}).include('[data-group-earning-result]').withTags(['wcag2a','wcag2aa']).analyze();assert.deepEqual(axe.violations,[],`${locale} detail accessibility`);checks.push({name:`axe-detail-${locale}-${width}`,violations:axe.violations});}
   }
   console.log('matrix',width,locale,'passed');await flush();
  }
 }
 for(const width of [360,375,768]){
  await freshPage(width);
  for(const locale of ['ko','ja','vi','th'])for(const route of [list,detail]){const name=`extra-${route===list?'list':'detail'}-long-${locale}-${width}`;if(checks.some(c=>c.name===name))continue;await navigate(route,'long',locale);await measure(name,width);}
 }
 for(const width of [390,1440]){
  await freshPage(width);
  for(const route of [list,detail]){
   const view=route===list?'list':'detail';
   await navigate(route,'restoring');assert.equal(await root().locator('h2').count(),0);await measure(`${view}-restoring-ko-${width}`,width);
   await page.evaluate(()=>window.earningsFixture.transition({ready:true,authenticated:false}));await root().locator('a[href^="/login"]').waitFor();assert.equal(await root().locator('h2').count(),0);await measure(`${view}-guest-ko-${width}`,width);
   await page.evaluate(()=>{window.earningsFixture.setState('ready');window.earningsFixture.transition({authenticated:true});});await root().locator('h2').first().waitFor();
   await page.evaluate(()=>window.earningsFixture.transition({authenticated:false}));assert.equal(await root().locator('h2').count(),0);
   for(const state of ['forbidden','missing','malformed','unauthorized']){await navigate(route,state);assert.equal(await root().locator('h2').count(),0);assert.ok(!(await root().innerText()).includes('PRIVATE_MESSAGE'));await measure(`${view}-${state}-ko-${width}`,width);}
   await navigate(route,'error');await page.evaluate(()=>window.earningsFixture.setState('ready'));await root().getByRole('button').click();await root().locator('h2').first().waitFor();assert.equal(await root().getByRole('alert').count(),0);
   // Pending A responses deliberately ignore abort in the fixture to test production identity checks.
   const raceRoute=route===list?list:`${list}/${encodeURIComponent('activity:'+group)}`;
   await navigate(raceRoute,'delayed');await page.waitForFunction(()=>window.earningsFixture.pending()>0);
   await page.evaluate(()=>window.earningsFixture.transition({ownerId:'synthetic-owner-b'}));await root().getByText('계정 B 활동',{exact:true}).waitFor();await page.evaluate(()=>window.earningsFixture.release());await page.waitForTimeout(50);
   assert.ok(!(await root().innerText()).includes('늦은 계정 A'));await measure(`${view}-account-transition-ko-${width}`,width);
   checks.push({name:`${view}-auth-retry-late-response-${width}`,passed:true});
  }
  await navigate(list,'page');assert.equal(await root().locator('li').count(),30);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.screenshot({path:path.join(out,`pagination-clearance-${width}.png`)});
  await root().getByRole('link',{name:'더 보기',exact:true}).click();await root().getByText('다음 페이지 활동',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('cursor'),'opaque+/=');assert.equal(await root().locator('li').count(),1);
  await root().getByRole('link',{name:'상세: 다음 페이지 활동'}).click();await page.locator('[data-group-earning-result]').waitFor();await root().getByRole('link',{name:'적립 내역으로'}).click();await root().getByText('다음 페이지 활동',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('cursor'),'opaque+/=');assert.equal(new URL(page.url()).searchParams.get('locale'),'ko');
  checks.push({name:`pagination30-detail-back-${width}`,passed:true});
  await navigate(list,'ready');await root().getByRole('link').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.matches(':focus-visible')),true);await page.screenshot({path:path.join(out,`keyboard-focus-${width}.png`),fullPage:true});
  assert.equal(await root().getByRole('link').evaluate(e=>getComputedStyle(e).outlineWidth),'3px');checks.push({name:`keyboard-focus-${width}`,passed:true,screenshot:`keyboard-focus-${width}.png`});
  for(const kind of ['hobby','brand']){await page.goto(`${base}${list}?locale=ko&state=ready&kind=${kind}`);await root().locator('li').first().waitFor();assert.ok((await root().innerText()).includes('엔카이브 팬페이지 · 전체 활동'));await measure(`list-${kind}-${width}`,width);}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);
 const sources=['features/groups/ui/group-earnings-screen.tsx','features/groups/ui/group-earning-result.tsx','features/groups/ui/group-earnings-copy.ts','features/groups/ui/group-earnings.module.css','app/pages/groups/[pageId]/earnings/page.tsx','app/pages/groups/[pageId]/earnings/[entryKey]/page.tsx'];
 const hashes=Object.fromEntries(await Promise.all(sources.map(async f=>[f,createHash('sha256').update(await fs.readFile(path.join(web,f))).digest('hex')])));
 checks.push({name:'source-lineage',repository:path.resolve(web,'../..'),hashes,referenceHash:'056b235f042c45698de727d6fe809c3431b4d4909609c87c6e900fd945976141'});
 await flush();console.log(JSON.stringify({checks:checks.length,screenshots:checks.filter(c=>c.screenshot).length,pageErrors:errors.length,consoleErrors:consoleErrors.length,externalRequests:externalRequests.length,passed:true}));
}finally{await flush();await browser.close();}
