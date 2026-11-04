import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {startHarness} from './server.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..'),out=path.join(here,'artifacts');
await fs.mkdir(out,{recursive:true});
const {server,baseURL}=await startHarness(Number(process.env.DISCARD_PORT??3139));
const browser=await chromium.launch(),results=[],captures=[];
const image=await fs.readFile(path.join(web,'public/images/groups/running-event.png')),assetId='e9200000-0000-4000-8000-000000000043';
const owned=['task-panel.tsx','source-confirm-dialog.tsx','activity-evidence-task.tsx','group-qualification.tsx'];
const lineage={environment:'Loopback fixture API responses, real production components and upload/request hooks; no live API or storage writes',files:Object.fromEntries(await Promise.all(owned.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(web,'features/groups/ui',name))).digest('hex')])))};
async function persist(){await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({lineage,results,captures},null,2));}
async function capture(page,key,state){
 await page.evaluate(()=>document.fonts.ready);const metrics=await page.evaluate(()=>{const d=document.querySelector('dialog[open]'),r=d?.getBoundingClientRect();return {openDialogs:document.querySelectorAll('dialog[open]').length,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialog:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,focus:document.activeElement?.textContent,overflow:[...document.querySelectorAll('dialog[open] button,dialog[open] h2,dialog[open] p')].filter(el=>{const b=el.getBoundingClientRect();return b.width&&b.height&&(b.left< -1||b.right>innerWidth+1);}).map(el=>el.textContent)};});
 assert.equal(metrics.openDialogs,1);assert(metrics.scrollWidth<=metrics.viewport);assert.deepEqual(metrics.overflow,[]);
 const file=path.join(out,`${key}-${state}.png`);await page.screenshot({path:file});captures.push({file,state,metrics});
}
async function setup(view,locale,width,height=900){
 const page=await browser.newPage({viewport:{width,height}}),requests=[],errors=[],unexpected=[];
 const gate={upload:null,submit:null};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
  if(url.origin!==baseURL){unexpected.push(req.url());return route.abort();}
  if(!p.startsWith('/api/')&&!p.startsWith('/fixture-upload'))return route.continue();
  const body=req.headers()['content-type']?.includes('application/json')?req.postDataJSON():null;requests.push({path:p,method,body});
  if(p.startsWith('/api/groups/images/'))return route.fulfill({status:200,contentType:'image/png',body:image});
  if(p==='/api/me/media/uploads'&&method==='POST'){gate.upload=route;return;}
  if(p==='/fixture-upload')return route.fulfill({status:200,body:''});
  if(p.endsWith('/complete'))return route.fulfill({json:{assetId,state:'ready',kind:'image',purpose:'group_image',contentType:'image/png',byteSize:image.length,assetVersion:1,width:800,height:800,durationSeconds:null,failureCode:null,retryAt:null,expiresAt:'2026-12-01T00:00:00Z'}});
  if(p.startsWith('/api/me/media/uploads/')&&method==='DELETE')return route.fulfill({status:204});
  if(p==='/api/discard-evidence'||p.startsWith('/api/groups/applications/')){gate.submit=route;return;}
  unexpected.push(`${method} ${p}`);return route.fulfill({status:500,json:{error:{code:'UNEXPECTED_FIXTURE_REQUEST'}}});
 });
 await page.goto(`${baseURL}/?view=${view}&locale=${locale}`);await page.waitForFunction(()=>window.discardFixture);
 const fixture=await page.evaluate(()=>window.discardFixture),trigger=page.locator('#open-task');await trigger.scrollIntoViewIfNeeded();await trigger.focus();const pageScroll=await page.evaluate(()=>scrollY);await trigger.press('Enter');await expect(page.locator('dialog[open]')).toHaveCount(1);
 return {page,requests,errors,unexpected,gate,c:fixture.copy,fixture,trigger,pageScroll};
}
async function checkBusy(s){
 const {page,c}=s;await expect(page.locator('.sourceTaskActions button').first()).toBeDisabled();await expect(page.locator('.sourceTaskActions button[type="submit"]')).toBeDisabled();
 await page.keyboard.press('Escape');await page.locator('.sourceTaskDefaultHeader button').click();await expect(page.locator('dialog[open]')).toHaveCount(1);await expect(page.getByRole('dialog',{name:c.discardTitle})).toHaveCount(0);assert.equal(await page.evaluate(()=>window.discardFixture.closed),0);
}
async function fill(s,view){
 const {page,c,gate}=s,body='  직접 작성한 원문 — Original draft\nLine breaks stay intact.  ',title='직접 쓴 제목 — Original title';
 if(view==='review')await page.getByRole('textbox',{name:c.evidence.title,exact:true}).fill(title);
 const field=page.locator('dialog textarea');await field.fill(body);
 await page.locator('dialog input[type="file"]').setInputFiles({name:'draft-proof.png',mimeType:'image/png',buffer:image});await expect.poll(()=>Boolean(gate.upload)).toBe(true);await checkBusy(s);
 await gate.upload.fulfill({json:{assetId,uploadUrl:baseURL+'/fixture-upload',uploadToken:'local-only',expiresAt:'2026-12-01T00:00:00Z',replayed:false}});gate.upload=null;
 await expect(page.getByRole('status')).toHaveCount(0);
 if(view==='photo'){const checkbox=page.getByRole('checkbox');await checkbox.focus();await checkbox.press('Space');await expect(checkbox).toBeChecked();}
 await expect(page.locator('.sourceTaskActions button[type="submit"]')).toBeEnabled();
 return {field,body,title};
}
async function submitFailure(s){
 const {page,gate}=s;await page.locator('.sourceTaskActions button[type="submit"]').click();await expect.poll(()=>Boolean(gate.submit)).toBe(true);await checkBusy(s);await gate.submit.fulfill({status:503,json:{error:{code:'LOCAL_FAILURE'}}});gate.submit=null;await expect(page.getByRole('alert')).toBeVisible();
}
try{
 const discovery=await browser.newPage();await discovery.goto(baseURL);await discovery.waitForFunction(()=>window.discardFixture);const allLocales=await discovery.evaluate(()=>window.discardFixture.locales);await discovery.close();
 const locales=process.env.DISCARD_LOCALES?process.env.DISCARD_LOCALES.split(','):allLocales;
 for(const width of [390,1440])for(const locale of locales)for(const view of ['review','photo','qualification']){
  const s=await setup(view,locale,width),{page,c,requests,trigger,pageScroll}=s,key=`${view}-${locale}-${width}`;
  try{
   const {field,body,title}=await fill(s,view),originalDialog=await page.locator('dialog').elementHandle(),originalField=await field.elementHandle(),originalForm=await field.locator('..').locator('xpath=ancestor::form').elementHandle();
   assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);
   await submitFailure(s);await expect(field).toHaveValue(body);
   // Exercise body scrolling without changing production layout styles.
   await page.setViewportSize({width,height:480});const scroll=page.locator('.sourceTaskScroll').first();await scroll.evaluate(el=>{el.scrollTop=120;});const bodyScroll=await scroll.evaluate(el=>el.scrollTop);assert(bodyScroll>0,`${key}: scrolling body required`);
   const cancel=page.locator('.sourceTaskActions button').first();await cancel.focus();await cancel.press('Enter');
   await expect(page.locator('dialog[open]')).toHaveCount(1);assert(await originalDialog.evaluate(el=>el===document.querySelector('dialog[open]')));assert(await originalField.evaluate(el=>el.isConnected));assert(await originalForm.evaluate(el=>el.isConnected));await expect(field).toBeHidden();await expect(page.getByRole('heading',{name:c.discardTitle})).toBeFocused();assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
   const visibleActions=page.locator('.sourceTaskActionSlot:not([hidden]) button'),headerClose=page.locator('.sourceTaskDefaultHeader button');
   await page.keyboard.press('Tab');await expect(headerClose).toBeFocused();await page.keyboard.press('Tab');await expect(visibleActions.first()).toBeFocused();await page.keyboard.press('Tab');await expect(visibleActions.last()).toBeFocused();await page.keyboard.press('Tab');await expect(headerClose).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(visibleActions.last()).toBeFocused();
   assert.equal(await visibleActions.last().evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
   await page.setViewportSize({width,height:900});if(['ko','fr'].includes(locale))await capture(page,key,'confirmation');
   await page.setViewportSize({width,height:480});await visibleActions.first().focus();await visibleActions.first().press('Enter');await expect(cancel).toBeFocused();await expect(field).toHaveValue(body);assert.equal(await scroll.evaluate(el=>el.scrollTop),bodyScroll);await expect(page.getByRole('alert')).toBeVisible();
   if(view==='review')await expect(page.getByRole('textbox',{name:c.evidence.title,exact:true})).toHaveValue(title);
   if(view==='photo')await expect(page.getByRole('checkbox')).toBeChecked();
   if(view==='qualification')await expect(page.getByText('draft-proof.png')).toBeVisible();else await expect(page.locator('dialog img')).toHaveCount(1);
   assert.equal(requests.filter(r=>r.method==='DELETE').length,0);
   await page.setViewportSize({width,height:900});if(['ko','fr'].includes(locale))await capture(page,key,'continued');
   await field.focus();await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:c.discardTitle})).toBeFocused();await page.keyboard.press('Escape');await expect(field).toBeFocused();
   await headerClose.click();await expect(page.getByRole('dialog',{name:c.discardTitle})).toBeVisible();await headerClose.click();await expect(headerClose).toBeFocused();await expect(field).toHaveValue(body);
   await submitFailure(s);const writes=requests.filter(r=>r.path==='/api/discard-evidence'||r.path.startsWith('/api/groups/applications/'));assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);if(view==='qualification'){assert.equal(writes[0].body.expectedRevision,3);assert.equal(writes[0].body.qualification.introduction,body.trim());assert.deepEqual(writes[0].body.qualification.assetIds,[s.fixture.application.qualification.assetIds[0],assetId]);}
   await cancel.click();await visibleActions.last().focus();await visibleActions.last().press('Enter');await expect(page.locator('dialog[open]')).toHaveCount(0);await expect(trigger).toBeFocused();assert.equal(await page.evaluate(()=>scrollY),pageScroll);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');await expect.poll(()=>requests.filter(r=>r.method==='DELETE').length).toBe(1);assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false);
   await trigger.press('Enter');await expect(page.locator('dialog textarea')).toHaveValue(view==='qualification'?'Original explanation':'');await expect(page.getByText('draft-proof.png')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);
   assert.deepEqual(s.errors,[]);assert.deepEqual(s.unexpected,[]);results.push({key,status:'passed',bodyScroll,checks:['one same native dialog','mounted draft/form/upload','title/body/attestation retained','confirmation heading and tab trap','continue/Escape/header focus return','body/page scroll restored','beforeunload lifecycle','upload and submit busy guards','failed retry payload/revision identity','discard cancels only current upload','reopen clean'],requests});
  }catch(error){results.push({key,status:'failed',error:String(error),errors:s.errors,unexpected:s.unexpected});await page.screenshot({path:path.join(out,`${key}-failure.png`)});throw error;}finally{await persist();await page.close();}
 }
 // Acknowledged saves consume uploads instead of discarding them.
 for(const width of [390,1440])for(const view of ['photo','review','qualification']){
  const s=await setup(view,'en',width);try{await fill(s,view);await submitFailure(s);await s.page.locator('.sourceTaskActions button').first().click();await s.page.keyboard.press('Escape');await s.page.locator('.sourceTaskActions button[type="submit"]').click();await expect.poll(()=>Boolean(s.gate.submit)).toBe(true);await s.gate.submit.fulfill({json:view==='qualification'?{id:s.fixture.application.id,status:'submitted',pageId:null}:{saved:true}});await expect(s.page.locator('dialog[open]')).toHaveCount(0);await expect(s.trigger).toBeFocused();assert.equal(s.requests.filter(r=>r.method==='DELETE').length,0);assert.deepEqual(s.errors,[]);assert.deepEqual(s.unexpected,[]);results.push({key:`${view}-success-${width}`,status:'passed',checks:['failed retry then acknowledged success','markUsed prevents upload cancellation'],requests:s.requests});}finally{await persist();await s.page.close();}
 }
 for(const width of [390,1440]){
  const s=await setup('standalone','fr',width);try{await expect(s.page.locator('dialog[open]')).toHaveCount(1);await s.page.keyboard.press('Escape');await expect(s.page.locator('dialog')).toHaveCount(0);await expect(s.trigger).toBeFocused();await expect(s.page.getByRole('textbox',{name:'Page draft'})).toHaveValue('Original page draft');results.push({key:`standalone-${width}`,status:'passed',checks:['page-only modal remains independent','Escape and trigger focus','page draft intact']});}finally{await persist();await s.page.close();}
 }
 console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,screenshots:captures.length,evidence:path.join(out,'checks.json')},null,2));
}finally{await persist();await browser.close();await server.close();}
