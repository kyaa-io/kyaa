import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {APP_LOCALES} from '../../i18n/locales.ts';
const base=process.env.QA_BASE_URL??'http://127.0.0.1:4269';
const out=process.env.QA_OUTPUT??'/Users/jewel/Desktop/Developement/byus/work/kyaa-web-launch-20261019/qa';
const productPaths=['e2e/web-launch-local/main.tsx','e2e/web-launch-local/fixtures.ts','e2e/web-launch-local/participation-fixtures.ts','e2e/web-launch-local/privy.ts','e2e/web-launch-local/session.ts','e2e/web-launch-local/navigation.ts','components/fan-shell/fan-app-shell.tsx','components/fan-shell/fan-app-shell.module.css','components/guest-home.tsx','components/guest-home.module.css','features/support/support-screen.tsx','features/support/support-screen.module.css','features/my/ui/my-screen.tsx','features/fandom/ui/fandom-screen.tsx','features/fandom/ui/live-participation-panel.tsx','features/benefit/ui/raffle-result-reveal.tsx','features/public-live-dashboard/ui/public-live-dashboard.tsx'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(productPaths.map(async p=>[p,await readFile(new URL(`../../${p}`,import.meta.url)).then(data=>createHash('sha256').update(data).digest('hex')).catch(()=>null)])));
const sourcesAtStart=await sourceHashes();
const supportTab=process.env.QA_SUPPORT_TAB;
const reportName=process.env.QA_REPORT??'measurements.json';
const metricsOnly=process.env.QA_METRICS_ONLY==='1';
const views=(process.env.QA_VIEWS??'home,support,my,result,fandom,dashboard').split(',');
await mkdir(out,{recursive:true});const browser=await chromium.launch();const results=[];const failures=[];
function fail(context,message){failures.push({context,message});}
async function inspect(page,label,{screenshot=!metricsOnly,axe=!metricsOnly}={}){
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(150);
 const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.images].filter(i=>i.getBoundingClientRect().width&&(!i.complete||!i.naturalWidth)).map(i=>i.getAttribute('src')),smallTargets:[...document.querySelectorAll('a,button,input:not([type=hidden]),select,textarea,[role=combobox]')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {text:e.getAttribute('aria-label')??e.textContent?.trim().slice(0,65),width:r.width,height:r.height,hidden:s.visibility==='hidden'||s.display==='none'||!r.width||!r.height||e.matches('input[aria-hidden="true"][tabindex="-1"]')};}).filter(e=>!e.hidden&&(e.width<43.5||e.height<43.5))}));
 if(metrics.overflow)fail(label,'horizontal overflow');if(metrics.images.length)fail(label,`unloaded images: ${metrics.images.join(',')}`);
 if(metrics.smallTargets.length)fail(label,`targets below 44px: ${JSON.stringify(metrics.smallTargets)}`);
 const violations=axe?(await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})):[];
 if(violations.length)fail(label,`axe: ${violations.map(v=>v.id).join(',')}`);
 if(screenshot)await page.screenshot({path:path.join(out,`${label}.png`),fullPage:true});
 return {...metrics,violations};
}
try{
 for(const view of views)for(const locale of APP_LOCALES.filter(l=>!process.env.QA_LOCALES||process.env.QA_LOCALES.split(',').includes(l))){const widths=['ko','ja','vi','th'].includes(locale)?[360,390,768,1440]:[390,1440];for(const width of widths.filter(w=>!process.env.QA_WIDTHS||process.env.QA_WIDTHS.split(',').includes(String(w)))){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const label=`${view}${supportTab?`-${supportTab}`:''}-${locale}-${width}`;
  try{await page.goto(`${base}/?view=${view}&locale=${locale}`);await expect(page.locator('main')).toBeVisible({timeout:15000});if(view==='support'&&supportTab)await page.locator('main nav').first().locator('button').nth(supportTab==='lucky'?1:2).click();await page.waitForFunction(()=>![...document.querySelectorAll('main [aria-busy=true]')].some(e=>e.getBoundingClientRect().height),null,{timeout:5000}).catch(()=>{});const metrics=await inspect(page,label);if(errors.length)fail(label,`runtime: ${errors.join(';')}`);results.push({label,view,locale,width,...metrics,errors});}catch(error){fail(label,String(error));}finally{await context.close();}
 }
 console.log(`${view}/${locale} complete`);
 }
 // Guest/loading failures and native wrapping use the same product components.
 for(const view of views)for(const state of process.env.QA_SKIP_STATES==='1'?[]:['empty','error','long','guest'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();const label=`${view}${supportTab?`-${supportTab}`:''}-${state}-${width}`;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await page.goto(`${base}/?view=${view}&locale=ko&${state==='guest'?'auth=off':`state=${state}`}`);await expect(page.locator('main')).toBeVisible({timeout:10000});if(view==='support'&&supportTab&&state!=='empty'&&state!=='error')await page.locator('main nav').first().locator('button').nth(supportTab==='lucky'?1:2).click();const metrics=await inspect(page,label,{axe:!metricsOnly});results.push({label,state,width,...metrics,errors});if(errors.length)fail(label,`runtime: ${errors.join(';')}`);}catch(error){fail(label,String(error));}finally{await context.close();}
 }
 // Verify a native keyboard path and language dialog focus in both actual navigation modes.
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});await page.goto(`${base}/?view=support&locale=ko`);await page.getByRole('spinbutton',{name:'수량'}).waitFor();await page.keyboard.press('Tab');const focus=await page.evaluate(()=>{const e=document.activeElement;return {visible:e.matches(':focus-visible'),outline:getComputedStyle(e).outlineStyle,text:e.textContent};});if(!focus.visible||focus.outline==='none')fail(`keyboard-${width}`,'initial Tab focus has no visible outline');
  const language=page.getByRole('combobox',{name:'언어 선택, 현재 한국어'});await language.focus();await page.keyboard.press('Enter');await page.getByRole('option',{name:'English',exact:true}).waitFor();await page.keyboard.press('Escape');if(!(await language.evaluate(e=>e===document.activeElement)))fail(`keyboard-${width}`,'language menu did not restore focus');await page.close();
 }
}finally{await browser.close();await writeFile(path.join(out,reportName),JSON.stringify({synthetic:true,base,views,sourcesAtStart,sourcesAtEnd:await sourceHashes(),results,failures},null,2));console.log(JSON.stringify({cases:results.length,failures:failures.length,report:path.join(out,reportName)}));}
if(failures.length)process.exitCode=1;
