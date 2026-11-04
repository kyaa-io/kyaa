import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),web=path.resolve(here,'../..'),repo=path.resolve(web,'../..'),out=path.join(here,'artifacts');
await fs.mkdir(out,{recursive:true});
const baseURL='http://127.0.0.1:3136',id='e9200000-0000-4000-8000-000000000041',pageId='e9200000-0000-4000-8000-000000000003';
const image=await fs.readFile(path.join(web,'public/images/groups/running-event.png'));
const browser=await chromium.launch(),results=[],captures=[];
const owned=['gift-copy.ts','group-invitation-copy.ts','activity-evidence-task.tsx','group-survey-form.tsx','activity-evidence-copy.ts','group-survey-copy.ts','group-gifts.tsx','group-membership-invitation.tsx'];
const lineage={repository:repo,head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),files:Object.fromEntries(await Promise.all(owned.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(web,'features/groups/ui',name))).digest('hex')]))),sourceSha256:'056b235f042c45698de727d6fe809c3431b4d4909609c87c6e900fd945976141',environment:'isolated production components with synthetic loopback API responses; shared invitation shell omitted; no live membership, mail or media storage'};
async function persist(){await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({lineage,results,captures},null,2));}
async function capture(page,locale,width,view,state){
 await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogWidth:document.querySelector('dialog[open]')?.getBoundingClientRect().width??null,clipped:[...document.querySelectorAll('button,h1,h2,h3,legend,p,label,span,a')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&e.getClientRects().length&&(!e.closest('dialog')||e.closest('dialog').open)&&(r.right>innerWidth+1||r.left< -1);}).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,120)}))}));
 assert.equal(metrics.width,width);assert(metrics.scrollWidth<=width,`${view}/${locale}/${width}: document overflow`);
 assert.deepEqual(metrics.clipped,[],`${view}/${locale}/${width}: clipped controls`);
 const name=`${view}-${locale}-${width}-${state}.png`,screenshot_path=path.join(out,name);
 await page.screenshot({path:screenshot_path,fullPage:true});
 captures.push({locale,width,view,state,url:page.url(),screenshot_path,metrics});
 // A native-size task crop makes every locale legible in contact sheets.
 const dialog=page.locator('dialog[open]').last();if(await dialog.count())await dialog.screenshot({path:path.join(out,`task-${name}`)});
}
try{
 const discovery=await browser.newPage();await discovery.goto(baseURL);await discovery.waitForFunction(()=>window.localizationFixture);const locales=await discovery.evaluate(()=>window.localizationFixture.locales);await discovery.close();assert.equal(locales.length,12);
 for(const width of [390,1440])for(const locale of locales)for(const view of ['gift','invite','consent','survey','photo','review']){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],consoleErrors=[],unexpected=[],requests=[],expectedFailures=[];
  let attempts=0,uploads=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method(),p=url.pathname;
   if(url.origin!==baseURL){unexpected.push(request.url());return route.abort();}
   if(!p.startsWith('/api/')&&!p.startsWith('/fixture-upload'))return route.continue();
   const body=request.headers()['content-type']?.includes('application/json')?request.postDataJSON():null;
   requests.push({path:p,method,body});
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(p.startsWith('/api/groups/images/'))return route.fulfill({status:200,contentType:'image/png',body:image});
   if(p==='/api/me/media/uploads'&&method==='POST'){
    uploads++;if(uploads===1){expectedFailures.push({path:p,status:503});return json({error:{code:'MEDIA_UNAVAILABLE'}},503);}
    return json({assetId:id,uploadUrl:baseURL+'/fixture-upload',uploadToken:'local-only',expiresAt:'2026-12-01T00:00:00Z',replayed:false});
   }
   if(p==='/fixture-upload')return route.fulfill({status:200,body:''});
   if(p.endsWith('/complete'))return json({assetId:id,state:'ready',kind:'image',purpose:'group_image',contentType:'image/png',byteSize:image.length,assetVersion:1,width:800,height:800,durationSeconds:null,failureCode:null,retryAt:null,expiresAt:'2026-12-01T00:00:00Z'});
   if(p.startsWith('/api/me/media/uploads/')&&method==='DELETE')return route.fulfill({status:204});
   if(p.includes('/gift-applications')&&method==='PATCH'){
    attempts++;if(attempts===1){expectedFailures.push({path:p,status:409});return json({error:{code:'GROUP_GIFT_CONFLICT'}},409);}
    return json({id,status:'submitted',revision:4});
   }
   if(p===`/api/groups/invitations/${id}`&&method==='GET')return json({id,status:'pending',pageId,pageName:'긴 원문 모임 이름 — Original long group name remains unchanged',pageHref:'/pages/groups/'+pageId,question:'원문 가입 질문 — Why would you like to join this group?',loginRequired:false,membershipVersion:'group-membership-v1',privacyVersion:'2026-10-11',expiresAt:'2026-12-01T00:00:00Z'});
   if(p.endsWith('/invitations')||p===`/api/groups/invitations/${id}`){
    attempts++;if(attempts===1){expectedFailures.push({path:p,status:503});return json({error:{code:'GROUP_INVITATION_UNAVAILABLE'}},503);}
    return json(view==='invite'?{id,status:'pending',expiresAt:'2026-12-01T00:00:00Z',deliveryStatus:'pending'}:{id,status:'accepted',pageId});
   }
   unexpected.push(`${method} ${p}`);return json({error:{code:'UNEXPECTED_FIXTURE_REQUEST'}},500);
  });
  await page.goto(`${baseURL}/?view=${view}&locale=${locale}`);await page.waitForFunction(()=>window.localizationFixture);
  const {copy:c,original}=await page.evaluate(()=>window.localizationFixture),draft='직접 작성한 원문 — My original input. '.repeat(5);
  const result={locale,width,view,checks:[],expectedFailures,errors,consoleErrors,unexpected};
  if(view==='gift'){
   await expect(page.locator('select[name="fulfillmentMethod"] option[value=""]')).toHaveText(c.gift.chooseMethod);
   await page.getByLabel(c.gift.image,{exact:true}).setInputFiles({name:'local-gift.png',mimeType:'image/png',buffer:image});
   await expect(page.getByRole('button',{name:c.gift.removeImage,exact:true})).toBeVisible();
   await page.getByRole('button',{name:c.gift.removeImage,exact:true}).click();
   await page.getByRole('textbox',{name:c.gift.name,exact:true}).fill('직접 입력한 선물 이름 — Original edited gift');
   await page.getByRole('textbox',{name:c.gift.conditions,exact:true}).fill(draft);
   await page.getByRole('button',{name:c.gift.revise,exact:true}).click();
   await expect(page.getByRole('alert')).toHaveText(c.gift.conflict);
   await expect(page.getByRole('textbox',{name:c.gift.conditions,exact:true})).toHaveValue(draft);
   await capture(page,locale,width,view,'long-conflict');
   await page.getByRole('button',{name:c.gift.revise,exact:true}).click();await page.waitForFunction(()=>window.localizationFixture.closed);
   const writes=requests.filter(r=>r.method==='PATCH');assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);assert.equal(writes[0].body.expectedRevision,3);
   assert.equal(writes[0].body.fulfillmentDescription,'현장 수령');
   result.checks.push('localized conflict and image/method controls','original draft and fulfillment description retained','revision unchanged','retry payload and idempotency ID identical');
  }else if(view==='invite'){
   await page.getByRole('textbox',{name:c.invitation.contact,exact:true}).fill('local-verification@example.invalid');
   await page.getByRole('button',{name:c.invitation.send,exact:true}).click();await expect(page.getByRole('alert')).toHaveText(c.groups.error);
   await capture(page,locale,width,view,'long-error');
   await page.getByRole('button',{name:c.invitation.send,exact:true}).click();await expect(page.getByRole('status')).toHaveText(c.invitation.queued);
   await capture(page,locale,width,view,'queued');
   const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);assert.equal(writes[0].body.locale,locale);
   result.checks.push('localized consent request and pending status','pending is not membership','retry ID retained');
  }else if(view==='consent'){
   await expect(page.getByRole('button',{name:c.invitation.later,exact:true})).toBeVisible();
   const accept=page.getByRole('button',{name:c.invitation.accept,exact:true});await expect(accept).toBeDisabled();
   await page.getByRole('checkbox',{name:c.invitation.membership,exact:true}).check();await expect(accept).toBeDisabled();
   await page.getByRole('checkbox',{name:c.invitation.privacy,exact:true}).check();await expect(accept).toBeDisabled();
   await page.getByRole('textbox').fill(draft);await accept.click();await expect(page.getByRole('alert')).toHaveText(c.groups.error);
   await page.getByRole('alert').scrollIntoViewIfNeeded();await expect(page.getByRole('alert')).toBeVisible();
   await capture(page,locale,width,view,'long-error');
   await page.locator('.sourceTaskScroll').evaluate(e=>e.scrollTop=0);await capture(page,locale,width,view,'long-error-top');
   await accept.click();await expect(page.getByRole('status')).toHaveText(c.invitation.accepted);
   const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);assert.equal(writes[0].body.membershipConsent,true);assert.equal(writes[0].body.privacyConsent,true);assert.equal(writes[0].body.answer,draft);
   result.checks.push('both consents and source question required','original answer and consent versions retained','retry ID retained');
  }else if(view==='survey'){
   await expect(page.getByRole('group',{name:original,exact:true})).toBeVisible();
   await page.getByRole('radio').first().check();await page.getByRole('textbox',{name:c.survey.comments,exact:true}).fill(draft);
   await page.getByRole('button',{name:c.survey.submit,exact:true}).click();await expect(page.getByRole('alert')).toHaveText(c.survey.error);
   await capture(page,locale,width,view,'long-error');
   const submissions=await page.evaluate(()=>window.localizationFixture.submissions);assert.deepEqual(submissions,[{body:draft,surveyChoice:0}]);
   await expect(page.getByRole('radio').first()).toBeChecked();result.checks.push('original question and options retained','failed choice and opinion retained','actual selection index submitted');
  }else if(view==='photo'){
   await page.getByRole('textbox',{name:c.evidence.description,exact:true}).fill(draft);
   await page.getByLabel(c.evidence.evidencePhoto,{exact:true}).setInputFiles({name:'local-photo.png',mimeType:'image/png',buffer:image});
   await expect(page.getByRole('alert')).toHaveText(c.evidence.uploadFailed);await expect(page.getByRole('button',{name:c.evidence.submitPhoto,exact:true})).toBeDisabled();
   await capture(page,locale,width,view,'long-upload-error');
   await page.locator('.sourceTaskScroll').evaluate(e=>e.scrollTop=e.scrollHeight);await capture(page,locale,width,view,'long-upload-error-bottom');
   await page.getByLabel(c.evidence.evidencePhoto,{exact:true}).setInputFiles({name:'local-photo-retry.png',mimeType:'image/png',buffer:image});
   await expect(page.getByRole('button',{name:c.evidence.remove,exact:true})).toBeVisible();
   const submit=page.getByRole('button',{name:c.evidence.submitPhoto,exact:true});await expect(submit).toBeDisabled();
   await page.getByRole('checkbox',{name:c.evidence.attestation,exact:true}).check();await expect(submit).toBeEnabled();await submit.click();
   await expect(page.getByRole('alert')).toHaveText(c.groups.error);await expect(page.getByRole('textbox',{name:c.evidence.description,exact:true})).toHaveValue(draft);
   const submissions=await page.evaluate(()=>window.localizationFixture.submissions);assert.deepEqual(submissions,[{body:draft,imageAssetId:id,originalAttested:true}]);
   result.checks.push('real upload hook failure and reselect','photo and affirmative attestation required','original body and asset ID retained');
  }else{
   await expect(page.getByText(c.evidence.confirmed,{exact:true})).toBeVisible();
   await page.getByRole('textbox',{name:c.evidence.title,exact:true}).fill('직접 쓴 원문 제목 — Original review title');
   await page.getByRole('textbox',{name:c.evidence.review,exact:true}).fill(draft);
   await page.getByRole('button',{name:c.evidence.submitReview,exact:true}).click();await expect(page.getByRole('alert')).toHaveText(c.groups.error);
   await capture(page,locale,width,view,'long-error');await page.locator('.sourceTaskScroll').evaluate(e=>e.scrollTop=e.scrollHeight);await capture(page,locale,width,view,'long-error-bottom');
   const submissions=await page.evaluate(()=>window.localizationFixture.submissions);assert.deepEqual(submissions,[{body:draft,title:'직접 쓴 원문 제목 — Original review title'}]);
   result.checks.push('optional photo remains optional','original title and body retained','attendance and permission localized');
  }
  await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,outline:document.activeElement?getComputedStyle(document.activeElement).outlineStyle:null}));result.focus=focus;
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  assert(consoleErrors.every(s=>s.includes('Failed to load resource')&&/409|503/.test(s)),`Unexpected console error: ${consoleErrors}`);
  results.push(result);await persist();await page.close();console.log(`${width} ${locale} ${view} verified`);
 }
 assert.equal(results.length,144);assert.equal(new Set(results.map(r=>`${r.locale}/${r.width}/${r.view}`)).size,144);
 console.log(JSON.stringify({cases:results.length,captures:captures.length,out}));
}catch(error){await persist();throw error;}finally{await browser.close();}
