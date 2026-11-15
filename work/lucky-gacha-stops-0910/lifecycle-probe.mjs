import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='work/lucky-gacha-stops-0910';
const results=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true,...(name==='chromium'?{args:['--use-angle=metal']}: {})});
 try {for(const width of [390,1440]) {
  const page=await browser.newPage({viewport:{width,height:844},...(name==='webkit'?{isMobile:true}: {})});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Desktop WebKit's benchmark classification is not an iPhone GPU measurement.
  if(name==='webkit') await page.route('**/gpu.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export async function canRunCapsuleMachine(){return true}'}));
  await page.addInitScript(()=>{const native=requestAnimationFrame;window.frameCalls=0;window.requestAnimationFrame=cb=>native(t=>{window.frameCalls++;cb(t)})});
  await page.goto('http://127.0.0.1:3187/');
  await page.waitForFunction(()=>document.querySelector('canvas')?.getAttribute('data-engine'));
  await page.waitForFunction(()=>document.querySelector('[data-lucky-stage]')?.getAttribute('data-lucky-graphics')==='3d');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-lucky-stage] picture img')).opacity)<0.001);
  await page.screenshot({path:`${out}/${name}-running-${width}.png`});
  await page.evaluate(()=>document.querySelector('main').style.marginTop='2000px');
  await page.waitForTimeout(200);
  let at=await page.evaluate(()=>window.frameCalls);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.frameCalls),at);
  await page.evaluate(()=>document.querySelector('main').style.marginTop='');
  await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>window.frameCalls)>at);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await page.waitForTimeout(200);at=await page.evaluate(()=>window.frameCalls);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.frameCalls),at);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>window.frameCalls)>at);
  const loss=await page.evaluate(()=>{window.lostCanvas=document.querySelector('canvas');window.restoreExt=window.lostCanvas.getContext('webgl2').getExtension('WEBGL_lose_context');if(!window.restoreExt)return false;window.restoreExt.loseContext();return true});
  assert.equal(loss,true);
  await page.waitForFunction(()=>document.querySelector('[data-lucky-stage]')?.getAttribute('data-lucky-graphics')==='still');
  assert.equal(await page.locator('canvas').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-lucky-stage] picture img')).opacity)>0.999);
  await page.screenshot({path:`${out}/${name}-context-lost-${width}.png`});
  await page.evaluate(()=>window.restoreExt.restoreContext());
  await page.waitForFunction(()=>document.querySelector('canvas')!==window.lostCanvas&&document.querySelector('[data-lucky-stage]')?.getAttribute('data-lucky-graphics')==='3d');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-lucky-stage] picture img')).opacity)<0.001);
  await page.screenshot({path:`${out}/${name}-restored-${width}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  results.push({browser:name,width,forcedGpuGate:name==='webkit',intersectionPauseResume:true,pageHideShowPauseResume:true,nativeContextLossShowsStill:true,nativeContextRestoreRebuilds:true,pageErrors:errors});
  await fs.writeFile(`${out}/lifecycle-checks.json`,JSON.stringify(results,null,2));
  await page.close();
 }}finally{await browser.close()}
}
console.log(results);
