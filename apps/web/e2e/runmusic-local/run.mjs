import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_LOCALES} from '../../i18n/locales.ts';
import {startHarness} from './server.mjs';

const output=process.env.RUNMUSIC_QA_OUTPUT??path.resolve('test-results/runmusic-local');
await mkdir(output,{recursive:true});
const harness=await startHarness(4211),browser=await chromium.launch({headless:true});
const results=[],errors=[],blockedExternal=[],accessibility=[];
const report={fixture:true,realProductionComponents:true,deadline:'2026-10-24T14:59:00Z',localOnly:true,results,errors,blockedExternal,accessibility};
let failure;
try {
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(!['http:','https:'].includes(url.protocol)||url.origin===harness.baseURL)return route.continue();
   blockedExternal.push(url.origin);return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push({width,url:page.url(),type:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')errors.push({width,url:page.url(),type:'console',message:message.text()});});
  const url=(scenario,locale='ko',extra={},resultsOnly=false)=>`${harness.baseURL}/connect/runmusic${resultsOnly?'/results':''}?${new URLSearchParams({scenario,locale,...extra})}`;
  async function check(scenario,locale,{screenshot=true,audit=false}={}){
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{})));await Promise.all(Array.from(document.querySelectorAll('svg image')).map(async node=>{const image=new Image();image.src=node.getAttribute('href');await image.decode();}));});
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:Array.from(document.images).filter(image=>!image.complete||image.naturalWidth===0).map(image=>image.getAttribute('src')),focusInDialog:document.querySelector('[role="dialog"]')?.contains(document.activeElement)??null}));
   expect(metrics.overflow,`${scenario} ${locale} ${width} overflow`).toBe(false);
   expect(metrics.brokenImages,`${scenario} broken assets`).toEqual([]);
   if(audit){const auditResult=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();if(auditResult.violations.length)accessibility.push({scenario,locale,width,violations:auditResult.violations.map(violation=>({id:violation.id,impact:violation.impact,nodes:violation.nodes.map(node=>({html:node.html,target:node.target,summary:node.failureSummary}))}))});}
   if(screenshot)await page.screenshot({path:path.join(output,`${scenario}-${locale}-${width}.png`),fullPage:true});
   results.push({scenario,locale,width,pass:!accessibility.some(item=>item.scenario===scenario&&item.locale===locale&&item.width===width),...metrics});
  }
  for(const locale of APP_LOCALES){
   await page.goto(url('new',locale));
   await expect(page.getByRole('dialog')).toBeVisible();
   expect(await page.getByRole('dialog').evaluate(dialog=>dialog.contains(document.activeElement))).toBe(true);
   await check('new-modal',locale,{audit:locale==='ko'||locale==='en'});
   for(let tab=0;tab<5;tab++){await page.keyboard.press('Tab');expect(await page.getByRole('dialog').evaluate(dialog=>dialog.contains(document.activeElement))).toBe(true);}
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.goto(url('missing-contact',locale));
   await expect(page.locator('#runmusic-kakao-id')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
   await check('missing-contact',locale,{audit:locale==='ko'||locale==='en'});
   for(const scenario of ['winner','loser','pending','processing']){
    await page.goto(url(scenario,locale,{},true));
    await expect(page.locator('#runmusic-main h2').first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if(scenario==='winner')await expect(page.getByText('91000000-0000-4000-8000-000000000002',{exact:true})).toBeVisible();
    if(scenario==='loser')await expect(page.locator('#runmusic-kakao-id')).toHaveCount(0);
    await check(`results-${scenario}`,locale,{audit:locale==='ko'});
   }
  }
  await page.goto(url('new'));
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'응모 확정',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'응모하기',exact:true}).click();
  await expect(dialog).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'응모하기',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'응모하기',exact:true}).click();
  expect(await page.evaluate(()=>window.__runmusicHarness.requests.filter(request=>request.method==='POST').length)).toBe(0);
  expect(await page.evaluate(()=>window.__runmusicHarness.clipboardReads)).toBe(0);
  await dialog.getByRole('button',{name:'붙여넣기',exact:true}).click();
  await expect(dialog.locator('#runmusic-kakao-id')).toHaveValue('fixture_kakao_id');
  await dialog.getByRole('button',{name:'RUN&MUSIC 좋아요',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'응모 확정',exact:true})).toBeEnabled();
  await check('contact-before-entry','ko',{audit:true});
  await dialog.getByRole('button',{name:'응모 확정',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.locator('#runmusic-kakao-id')).toHaveValue('');
  await expect(page.getByText(/fi\*\*\*id/)).toBeVisible();
  const requests=await page.evaluate(()=>window.__runmusicHarness.requests);
  expect(requests.filter(request=>request.method==='POST').map(request=>request.path)).toEqual(['/api/celebrities/runmusic/reactions','/api/me/runmusic']);
  expect(requests.filter(request=>request.method==='POST'&&request.body).map(request=>request.body.action)).toEqual(['enter']);
  expect(requests.find(request=>request.body?.action==='enter').body.kakaoId).toBe('fixture_kakao_id');
  await check('like-enter-contact-save','ko',{audit:true});
  await page.getByRole('link',{name:'내 응모 결과',exact:true}).click();await expect(page).toHaveURL(/\/results\?locale=ko/);
  results.push({width,scenario:'result-link',pass:true});
  await page.goto(url('existing'));await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText(/fi\*\*\*id/)).toBeVisible();await check('existing','ko');
  await page.goto(url('paste-denied'));await expect(page.locator('#runmusic-kakao-id')).toBeVisible();
  expect(await page.evaluate(()=>window.__runmusicHarness.clipboardReads)).toBe(0);
  await page.getByRole('button',{name:'붙여넣기',exact:true}).click();await expect(page.getByText(/직접 입력/)).toBeVisible();
  await page.locator('#runmusic-kakao-id').fill('manual_fixture_id');await page.getByRole('button',{name:'연락처 저장',exact:true}).click();
  await expect(page.getByText(/fi\*\*\*id/)).toBeVisible();await check('paste-denied-manual-save','ko');
  await page.goto(url('contact-save-error'));await expect(page.locator('#runmusic-kakao-id')).toBeVisible();
  await page.locator('#runmusic-kakao-id').fill('retained_fixture_id');await page.getByRole('button',{name:'연락처 저장',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('#runmusic-kakao-id')).toHaveValue('retained_fixture_id');
  expect(await page.evaluate(()=>window.__runmusicHarness.status().entered)).toBe(true);
  await check('contact-save-error','ko',{audit:true});
  await page.getByRole('button',{name:'연락처 저장',exact:true}).click();await expect(page.getByText(/fi\*\*\*id/)).toBeVisible();
  await page.goto(url('closed'));await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'응모가 마감됐어요.',exact:true})).toBeDisabled();await check('closed','ko');
  await page.goto(url('restoring'));await expect(page.getByRole('status')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>window.__runmusicHarness.requests)).toEqual([]);results.push({width,scenario:'restoring-no-premature-modal',pass:true});
  for(const resultsOnly of [false,true]){
   await page.goto(url('new','en',{auth:'off'},resultsOnly));
   await expect(page.getByRole('dialog')).toHaveCount(0);
   const login=page.locator('a[href^="/login"]');await expect(login).toBeVisible();
   const loginUrl=new URL(await login.getAttribute('href'),harness.baseURL);
   expect(loginUrl.searchParams.get('returnTo')).toBe(`/connect/runmusic${resultsOnly?'/results':''}?locale=en`);
   await check(resultsOnly?'guest-results':'guest','en');await login.click();await expect(page.getByRole('heading',{name:'Local login return fixture'})).toBeVisible();
   results.push({width,scenario:resultsOnly?'guest-results-login-return':'guest-login-return',pass:true});
  }
  await page.goto(url('not-entered','ko',{},true));await expect(page.getByText('응모 내역이 없어요.',{exact:true})).toBeVisible();await check('results-not-entered','ko');
  for(const locale of ['ko','en']){
   await page.goto(url('admin',locale,{view:'admin'}));await expect(page.getByText('fi***id',{exact:true})).toBeVisible();
   await check('admin',locale,{audit:true});
   await page.getByRole('button',{name:locale==='ko'?'연락처 보기':'Reveal contact',exact:true}).click();await expect(page.getByText('fixture_kakao_id',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:locale==='ko'?'연락처 숨기기':'Hide contact',exact:true}).click();await expect(page.getByText('fixture_kakao_id',{exact:true})).toHaveCount(0);
   await page.getByRole('button',{name:locale==='ko'?'수령 완료 처리':'Mark collected',exact:true}).click();await expect(page.getByRole('button',{name:locale==='ko'?'수령 완료 처리':'Mark collected',exact:true})).toHaveCount(0);
   results.push({width,locale,scenario:'admin-reveal-hide-receive',pass:true});
  }
  for(const locale of ['ko','en']){
   await page.goto(url('existing',locale,{view:'banner'}));await expect(page.locator('[data-managed-home-banner] img')).toBeVisible();
   await check('banner',locale,{audit:true});
   await page.getByRole('link',{name:locale==='ko'?'이벤트 보기':'View event',exact:true}).click();
   await expect(page).toHaveURL(new RegExp(`/connect/runmusic\\?locale=${locale}$`));
   results.push({width,locale,scenario:'banner-event-link',pass:true});
  }
  await context.close();
 }
 {
  const context=await browser.newContext({viewport:{width:768,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===harness.baseURL?route.continue():route.abort('blockedbyclient'));
  page.on('pageerror',error=>errors.push({width:768,type:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')errors.push({width:768,type:'console',message:message.text()});});
  for(const locale of ['ko','en']){
   await page.goto(`${harness.baseURL}/connect/runmusic?scenario=existing&view=banner&locale=${locale}`);
   await expect(page.locator('[data-managed-home-banner] img')).toBeVisible();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(image=>image.decode()));});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
   expect(await page.locator('[data-managed-home-banner] img').evaluate(image=>image.currentSrc)).toContain('/images/runmusic/banner-desktop.png');
   await page.screenshot({path:path.join(output,`banner-${locale}-768.png`),fullPage:true});
   results.push({width:768,locale,scenario:'banner',pass:true});
  }
  await context.close();
 }
 expect(accessibility).toEqual([]);expect(errors).toEqual([]);expect(blockedExternal).toEqual([]);
 console.log(`PASS ${results.length} RUNMUSIC browser checks; ${APP_LOCALES.length} locales; 390/1440. ${output}`);
}catch(error){failure=error;report.failure=String(error.stack??error);console.error(report.failure);}
finally{await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));await browser.close();await harness.server.close();}
if(failure)process.exitCode=1;
