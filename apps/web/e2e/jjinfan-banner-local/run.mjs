import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base='http://localhost:4217';
const out=new URL('../../../../release-notes/images/',import.meta.url);
const evidence=new URL('../../../../work/jjinfan-banner/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 const page=await browser.newPage({reducedMotion:'reduce',deviceScaleFactor:1});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  await page.goto(base+'/?locale=ko');
  const carousel=page.locator('[data-compact]');
  await carousel.waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;document.querySelector('[data-compact]').scrollIntoView({block:'start'});scrollBy(0,-100);});
  for(const [i,name] of ['home','hiroro','minju'].entries()){
   if(i){const next=carousel.getByRole('button',{name:'다음 배너',exact:true});await next.press('Enter');await next.evaluate(b=>b.blur());}
   const slug=['yuna','hiroro','mmnoo-s'][i];
   await page.waitForFunction(slug=>document.querySelector('[data-compact] article[data-active=true] [data-jjinfan-banner]')?.dataset.jjinfanBanner===slug,slug);
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-compact] article[data-active=true] img')].every(i=>i.complete&&i.naturalWidth>0));
   const rect=await carousel.boundingBox();assert.equal(rect.height,width===390?160:240);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
   await page.screenshot({path:new URL(`2026-11-12-jjinfan-${name}${width}.png`,out).pathname,animations:'disabled'});
   results.push({width,view:name,height:rect.height,overflow:0});
  }
  await page.goto(base+'/yuna?locale=ko&challenge=jjinfan100');
  const dialog=page.getByRole('dialog');await dialog.waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:new URL(`2026-11-12-jjinfan-modal${width}.png`,out).pathname,animations:'disabled'});
  const buttons=await dialog.getByRole('button').evaluateAll(nodes=>nodes.map(e=>({label:e.ariaLabel||e.textContent,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
  assert(buttons.every(b=>b.w>=44&&b.h>=44));
  const dialogBounds=await dialog.boundingBox();assert(Math.abs(buttons.find(b=>b.label==='동참하기').w-(dialogBounds.width-40))<1);
  await page.keyboard.press('Escape');await page.waitForURL(url=>!url.searchParams.has('challenge'));
  assert.equal(new URL(page.url()).searchParams.get('locale'),'ko');results.push({width,view:'modal',buttons,escape:true});
 }
 for(const [slug,state,expected] of [['yuna','verified',false],['hiroro','new',true],['mmnoo-s',null,true]]){
  await page.goto(`${base}/${slug}?locale=ko&challenge=jjinfan100${state?'&viewer='+state:''}`);
  if(expected){await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button',{name:'동참하기',exact:true}).click();await page.waitForURL(url=>url.pathname===`/c/${slug}/verify`);assert.equal(new URL(page.url()).searchParams.get('returnTo'),`/${slug}?locale=ko`);}
  else{await page.getByText('내 패스포트',{exact:true}).first().waitFor();assert.equal(await page.getByRole('dialog').count(),0);}
  results.push({slug,state,dialogExpected:expected,pass:true});
 }
 const normal=await browser.newPage({viewport:{width:1440,height:900}});
 await normal.goto(base+'/?locale=ko');const c=normal.locator('[data-compact]');await c.scrollIntoViewIfNeeded();await c.getByRole('button',{name:'다음 배너',exact:true}).click();await normal.waitForFunction(()=>document.querySelector('[data-compact] article[data-active=true] [data-jjinfan-banner]')?.dataset.jjinfanBanner==='hiroro');await c.getByRole('button',{name:'이전 배너',exact:true}).click();await normal.waitForFunction(()=>document.querySelector('[data-compact] article[data-active=true] [data-jjinfan-banner]')?.dataset.jjinfanBanner==='yuna');results.push({motion:'normal',nextPrevious:true});
 await writeFile(new URL('browser-checks.json',evidence),JSON.stringify(results,null,2));console.log(JSON.stringify({pass:true,checks:results.length,captures:8,viewportPixels:'390 and1440, deviceScaleFactor1'},null,2));
} finally {await browser.close();}
