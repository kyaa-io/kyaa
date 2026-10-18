import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {APP_LOCALES} from '../../i18n/locales.ts';
const base=process.env.QA_BASE_URL??'http://127.0.0.1:4269',out=process.env.QA_OUTPUT??'/Users/jewel/Desktop/Developement/byus/work/kyaa-web-launch-20261019/qa';await mkdir(out,{recursive:true});const browser=await chromium.launch(),results=[],failures=[];
const hashPaths=['main.tsx','fixtures.ts','participation-fixtures.ts','privy.ts','session.ts','navigation.ts','../../features/fandom/ui/live-participation-panel.tsx','../../features/fandom/ui/fandom-screen.module.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(hashPaths.map(async file=>[file,createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex')])));
const hashesAtStart=await hashes();
const journal=`${out}/${process.env.QA_JOURNAL??"dialog-cases.ndjson"}`;
await writeFile(journal,JSON.stringify({synthetic:true,startedAt:new Date().toISOString(),hashesAtStart})+"\n");
const missions=[['comment','during'],['quiz','during'],['crew','during'],['topic','before'],['story','before'],['dance','before'],['song','before']];
try{for(const locale of APP_LOCALES.filter(l=>!process.env.QA_LOCALES||process.env.QA_LOCALES.split(',').includes(l))){for(const width of (['ko','ja','vi','th'].includes(locale)?[360,390,768,1440]:[390,1440]).filter(w=>!process.env.QA_WIDTHS||process.env.QA_WIDTHS.split(',').includes(String(w)))){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
 for(const [key,phase] of missions.filter(([key])=>!process.env.QA_DIALOGS||process.env.QA_DIALOGS.split(',').includes(key))){const label=`dialog-${key}-${locale}-${width}`;const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
 try{await page.goto(`${base}/?view=fandom&locale=${locale}&phase=${phase}`);const trigger=page.getByRole('button',{name:new RegExp(`Example ${key} · 예시 활동`)});await trigger.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
 const axe=await new AxeBuilder({page}).include('[role=dialog]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();const metrics=await dialog.evaluate(root=>({overflow:root.scrollWidth>root.clientWidth+1,font:getComputedStyle(root).fontFamily,initialFocus:root.contains(document.activeElement),targets:[...root.querySelectorAll('a,button,input,select,textarea')].map(e=>{const effective=e.matches('input[type=radio],input[type=checkbox]')?e.closest('label')??e:e;const r=effective.getBoundingClientRect(),s=getComputedStyle(e);return {text:effective.getAttribute('aria-label')??effective.textContent?.trim().slice(0,60),width:r.width,height:r.height,hidden:!r.width||!r.height||s.visibility==='hidden'||s.display==='none'||e.matches('input[aria-hidden=true][tabindex="-1"]')};}).filter(e=>!e.hidden&&(e.width<43.5||e.height<43.5))}));if(metrics.overflow||!metrics.initialFocus||metrics.targets.length||axe.violations.length||errors.length)failures.push({label,...metrics,axe:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),errors});
 await page.keyboard.press('Tab');const trapped=await dialog.evaluate(e=>e.contains(document.activeElement));if(!trapped)failures.push({label,error:'Tab escaped dialog'});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();if(process.env.QA_NO_SCREENSHOTS!=='1'&&locale==='ko'&&[390,1440].includes(width)){await trigger.click();await page.screenshot({path:`${out}/${label}.png`,fullPage:true});}results.push({label,...metrics,axeViolations:axe.violations.length,errors});
 }catch(error){failures.push({label,error:String(error)});}finally{page.off('pageerror',onError);await appendFile(journal,JSON.stringify({label,result:results.find(r=>r.label===label)??null,failures:failures.filter(f=>f.label===label)})+'\n');}
 }
 await context.close();}console.log(`dialog ${locale} complete`);}
}finally{await browser.close();await writeFile(`${out}/${process.env.QA_REPORT??"dialog-measurements.json"}`,JSON.stringify({synthetic:true,hashesAtStart,hashesAtEnd:await hashes(),results,failures},null,2));console.log(JSON.stringify({cases:results.length,failures:failures.length}));}
if(failures.length)process.exitCode=1;
