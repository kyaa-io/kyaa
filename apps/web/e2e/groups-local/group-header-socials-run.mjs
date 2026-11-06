// The social links in the page header must stay reachable next to the join action at phone widths.
// Run with: node apps/web/e2e/groups-local/group-header-socials-run.mjs (starts its own loopback harness; synthetic data).
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { startHarness } from './server.mjs';
const harness=await startHarness(Number(process.env.GROUPS_LOCAL_PORT??3612));
const browser=await chromium.launch({headless:true});
try{
 for(const width of [360,390,768,1023,1440])for(const [who,auth] of [['guest','&auth=off'],['non-member','']])for(const locale of ['ko','es']){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(`${harness.baseURL}/?view=detail&tab=members&kind=fan&locale=${locale}${auth}`);
  const links=page.locator('[class*="creatorSocials"] [data-outbound-kind="social"]');
  await links.first().waitFor();
  const label=`${who} ${locale} ${width}`,count=await links.count();
  assert.ok(count>=2,`${label}: social links missing`);
  for(let i=0;i<count;i++){
   const link=links.nth(i);await link.scrollIntoViewIfNeeded();
   const hit=await link.evaluate(node=>{const r=node.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{ok:Boolean(top&&node.contains(top)),on:top?.textContent?.trim().slice(0,30),width:r.width,height:r.height};});
   assert.ok(hit.ok,`${label}: social link ${i} is covered by "${hit.on}"`);
   assert.ok(hit.width>=44&&hit.height>=44,`${label}: social link ${i} target ${hit.width}x${hit.height}`);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: page overflows`);
  await page.close();
 }
 console.log('PASS group header socials');
}finally{await browser.close();await harness.server.close();}
