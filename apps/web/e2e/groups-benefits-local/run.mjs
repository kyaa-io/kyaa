import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('../..'),out=path.resolve('e2e/groups-benefits-local/evidence'),base='http://127.0.0.1:5196',id='10000000-0000-4000-8000-000000000001';
await mkdir(out,{recursive:true});
const resume=process.argv.includes('--resume');
const browser=await chromium.launch(),page=await browser.newPage(),manifest=resume?JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8')):[],failures=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const routes={benefits:'/benefits',capsule:'/my/capsules',raffle:`/pages/groups/${id}/raffles/${id}`};
const check=(value,message)=>{if(!value)failures.push(message);};
async function visit(surface,width,locale='ko',state='ready',extra=''){
 await page.setViewportSize({width,height:1000});
 await page.goto(`${base}${routes[surface]??surface}?locale=${locale}&state=${state}${extra}`,{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 if(state==='ready')await page.waitForFunction(()=>!document.querySelector('main [role=status]'));
}
async function capture(surface,width,locale,state){
 const name=`${surface}-${locale}-${width}-${state}`,file=path.join(out,name+'.png');
 const metrics=await page.evaluate(()=>{
  const main=document.querySelector('main'),rect=main.getBoundingClientRect();
  const current=[...document.querySelectorAll('nav a[aria-current=page]')].filter(el=>el.getBoundingClientRect().height>0&&el.checkVisibility()).map(el=>el.getAttribute('href'));
  const images=[...main.querySelectorAll('img')].map(el=>({src:el.getAttribute('src'),loaded:el.complete&&el.naturalWidth>0,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,fit:getComputedStyle(el).objectFit}));
  const cards=[...main.querySelectorAll('article')].map(el=>{const b=el.getBoundingClientRect(),a=el.querySelector(':scope>a')?.getBoundingClientRect();return {top:b.top,bottom:b.bottom,buttonTop:a?.top,buttonBottom:a?.bottom};});
  const clipped=[...main.querySelectorAll('button,label,summary,h1,h2,h3,strong')].filter(el=>el.checkVisibility()&&el.clientWidth>0&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2)).map(el=>({tag:el.tagName,text:el.textContent,width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight}));
  const radioRows=[...main.querySelectorAll('label:has(input[type=radio])')].map(el=>({labelBottom:el.querySelector('span').getBoundingClientRect().bottom,metaTop:el.querySelector('small').getBoundingClientRect().top}));
  return {radioRows,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,main:{left:rect.left,right:rect.right,top:rect.top},current,images,cards,clipped,requests:window.benefitsHarness.requests};
 });
 check(metrics.width===width&&metrics.scrollWidth<=width,`${name}: overflow ${metrics.scrollWidth}`);
 check(metrics.current.every(href=>href.startsWith('/benefits?'))&&metrics.current.length===1,`${name}: global active nav ${metrics.current}`);
 check(metrics.images.every(image=>image.loaded),`${name}: unloaded image`);
 check(metrics.radioRows.every(row=>row.labelBottom<=row.metaTop),`${name}: radio label overlaps ticket metadata`);
 check(!metrics.clipped.length,`${name}: clipped controls/text ${JSON.stringify(metrics.clipped)}`);
 for(let i=0;i<metrics.cards.length;i++)for(let j=i+1;j<metrics.cards.length;j++){const a=metrics.cards[i],b=metrics.cards[j];if(Math.abs(a.top-b.top)<1)check(Math.abs(a.bottom-b.bottom)<=1&&Math.abs(a.buttonTop-b.buttonTop)<=1,`${name}: card baseline`);}
 await page.screenshot({path:file,fullPage:true});
 await page.locator('main').screenshot({path:path.join(out,name+'-main.png')});
 manifest.push({surface,state,locale,width,url:page.url(),screenshot_path:file,metrics,errors:errors.splice(0)});
 await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
}
await visit('benefits',390);const locales=await page.evaluate(()=>window.benefitsHarness.locales);
if(!resume)for(const locale of locales)for(const width of [390,1440]){
 for(const surface of ['benefits','capsule','raffle']){
  await visit(surface,width,locale);await capture(surface,width,locale,'ready');
  if(surface==='capsule'){
   await page.locator('input[type=radio]').nth(1).check();await page.locator('button[data-campaign-id]').click();await page.waitForSelector('[data-capsule-phase="3"]');
   check(await page.locator('[data-capsule-count="10"] li').count()===10,`${locale}/${width}: committed ten results`);await capture(surface,width,locale,'result10');
  }
  if(surface==='raffle'){
   await page.locator('input[type=number]').fill('10');await page.locator('form button[type=submit]').click();await page.waitForSelector('[role=dialog],dialog[open]');
   check((await page.evaluate(()=>window.benefitsHarness.requests)).every(r=>r.method==='GET'),`${locale}/${width}: confirmation must not debit`);
   await capture(surface,width,locale,'confirm');await page.keyboard.press('Escape');
  }
 }
}
if(!resume)for(const width of [390,1440]){
 for(const state of ['empty','error','loading','long']){await visit('benefits',width,'ko',state);await capture('benefits',width,'ko',state);}
 for(const surface of ['benefits','capsule','raffle']){await visit(surface,width,'ko','ready','&auth=off');await capture(surface,width,'ko','guest');}
 for(const [surface,state]of [['capsule','fenced'],['capsule','insufficient'],['raffle','nonmember'],['raffle','insufficient']]){await visit(surface,width,'ko',state);await capture(surface,width,'ko',state);}
 await visit('capsule',width);await page.locator('button[data-campaign-id]').click();await page.waitForSelector('[data-capsule-phase="3"]');await capture('capsule',width,'ko','result1');
 await visit('raffle',width);await page.locator('input[type=number]').fill('10');await page.locator('form button[type=submit]').click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'10장으로 응모하기'}).click();await page.getByRole('heading',{name:'응모를 완료했어요'}).waitFor();await capture('raffle',width,'ko','accepted');
 for(const gate of ['on','off']){await visit('/benefits/synthetic-detail',width,'ko','ready',`&gate=${gate}`);const active=await page.locator('nav a[aria-current=page]').evaluateAll(els=>els.filter(e=>e.checkVisibility()).map(e=>e.getAttribute('href')));check(active.length===1&&active[0].startsWith(gate==='on'?'/benefits?':'/my?'),`detail ${gate} ${width}`);await page.screenshot({path:path.join(out,`detail-${gate}-${width}.png`),fullPage:true});}
}
// Runtime cursor/retry/owner-transition paths use the real resource hook.
await visit('benefits',1440);await page.getByRole('region',{name:'럭키드로우'}).getByRole('button',{name:'더 보기'}).click();await page.getByText('두 번째 · Second page',{exact:true}).waitFor();check(await page.getByText('합성 데이터 · Synthetic raffle',{exact:true}).count()===1,'cursor retains first page');
await page.evaluate(()=>{window.benefitsHarness.setState('empty');window.benefitsHarness.transition({ownerId:'synthetic-owner-b'});});await page.getByText('아직 공개된 항목이 없어요.').first().waitFor();check(await page.getByText('두 번째 · Second page',{exact:true}).count()===0,'owner clears paginated data');
await visit('benefits',390,'ko','error');await page.evaluate(()=>window.benefitsHarness.setState('ready'));await page.getByRole('button',{name:'다시 시도'}).first().click();await page.getByText('1,370 P',{exact:true}).waitFor();await page.getByRole('region',{name:'럭키드로우'}).getByRole('button',{name:'다시 시도'}).click();await page.getByText('합성 데이터 · Synthetic raffle',{exact:true}).waitFor();await page.getByRole('region',{name:'포인트 이벤트'}).getByRole('button',{name:'다시 시도'}).click();await page.getByText('합성 설문 · Synthetic survey',{exact:true}).waitFor();await page.getByText('합성 데이터 · Synthetic raffle',{exact:true}).waitFor();await capture('benefits',390,'ko','retried');
await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle}));check(focus.outline!=='none','keyboard focus visible');
for(const row of manifest){const m=row.metrics;check(m.scrollWidth<=m.width,`${row.surface}/${row.locale}/${row.width}: overflow`);check(!m.clipped.length,`${row.surface}/${row.locale}/${row.width}: clipped`);check(m.images.every(i=>i.loaded),`${row.surface}/${row.locale}/${row.width}: image`);check(m.current.length===1&&m.current[0].startsWith('/benefits?'),`${row.surface}/${row.locale}/${row.width}: nav`);}
for(const row of manifest)check(!row.errors.length,`${row.surface}/${row.locale}/${row.width}/${row.state}: console ${row.errors}`);
const sources=['app/benefits/page.tsx','features/groups/ui/group-benefits-screen.tsx','features/groups/ui/group-benefits.module.css','features/groups/ui/group-benefits-copy.ts','features/groups/ui/group-activity-frame.tsx','features/groups/ui/group-activity-frame.module.css','features/group-capsule/capsule-screen.tsx','features/group-capsule/capsule.module.css','features/group-raffle/raffle-screen.tsx','features/group-raffle/raffle.module.css','components/fan-shell/fan-app-shell.tsx'];
const hashes=Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const result={repository:root,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirtySourceHashes:hashes,syntheticOnly:true,localPresentation:false,locales,count:manifest.length,failures,focus,checks:['catalog pagination','owner reset','retry','confirm no debit','synthetic committed results','active navigation gate on/off','overflow','card baselines','image loads','keyboard focus']};
await writeFile(path.join(out,'checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();if(failures.length)process.exitCode=1;
