import { APP_LOCALES } from "../../i18n/locales.ts";
import { waveFriendsCopy } from "../../i18n/catalogs/features__fanpage__wave-friends.ts";
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startHarness } from './server.mjs';
const out=process.env.WAVE_EVIDENCE_DIR || 'test-results/wave-programs-local';
await mkdir(out,{recursive:true});
const harness=await startHarness(4198), browser=await chromium.launch(), checks=[];
try {
 for (const locale of APP_LOCALES) for (const width of [390,1440,...(['ko','ja','vi','th'].includes(locale)?[360,768]:[])]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const copy=waveFriendsCopy(locale);
  const base=`${harness.baseURL}/kyaa-wave-fanpage?tab=friends&locale=${locale}&friends=populated`;
  for(const state of ['ready','empty','error','loading']) {
   await page.goto(`${base}&members=${state}`);
   const directory=page.getByRole('region',{name:copy.membersTitle,exact:true});
   await expect(directory).toBeVisible();
   if(state==='ready') {await expect(directory.locator('li')).toHaveCount(50);await page.waitForFunction(()=>[...document.images].filter(i=>i.closest('main')).every(i=>i.complete&&i.naturalWidth>0));}
   else await expect(directory.getByText(state==='empty'?copy.membersEmpty:state==='error'?copy.error:copy.loading,{exact:true})).toBeVisible();
   await page.evaluate(()=>document.fonts.ready);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`directory overflow ${locale} ${width} ${state}`);
   if(state==='ready') assert(await directory.locator('li strong').evaluateAll(names=>names.every(name=>name.getBoundingClientRect().width>=112)),`readable name width ${locale} ${width}`);
   assert(await directory.locator('button').evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect();return r.width>=44 && r.height>=44;})),`44px targets ${locale} ${width}`);
   if(state==='ready' && [390,1440].includes(width)) {
    await directory.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-112));
    await page.screenshot({path:`${out}/ui-members-${locale}-${width}.png`});
    if(locale==='ko') {const audit=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa']).analyze();assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
   }
   checks.push(`members ${locale} ${width} ${state}`);
  }
  for(const state of ['loading','error']) {
   await page.goto(`${base.replace('friends=populated',`friends=${state}`)}`);
   const directory=page.getByRole('region',{name:copy.membersTitle,exact:true});await expect(directory.locator('li')).toHaveCount(50);
   await expect(directory.locator('li button').first()).toBeDisabled();
   await expect(directory.getByText(state==='loading'?copy.relationshipLoading:copy.relationshipError,{exact:true})).toBeVisible();
   checks.push(`relationships ${locale} ${width} ${state}`);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 if(process.env.WAVE_MEMBERS_ONLY !== '1') {
 for(const locale of APP_LOCALES) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}), page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${harness.baseURL}/kyaa-wave-fanpage?locale=${locale}&auth=off`);
  await expect(page.locator('ol a[href*="/programs/"]')).toHaveCount(3);
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'home overflow');
  assert(await page.locator('#celebrity-content a').evaluateAll(links=>links.length===7 && links.every(link=>{const rect=link.getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth && rect.height>=44;})),'all seven Wave destinations remain visible');
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
 }
 await writeFile(`${out}/evidence.json`,JSON.stringify({boundary:'Actual UI and CSS with loopback synthetic auth/API and example photo. Database tested separately.',checks},null,2));console.log(checks.join('\n'));
} finally {await browser.close();await harness.server.close();}
