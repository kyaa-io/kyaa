// Local review of the guide banners as discovery slides.
// Usage: GROUPS_GUIDE_BANNER_BASE=http://127.0.0.1:3701 GROUPS_GUIDE_BANNER_OUT=<dir> node groups-guide-banner-run.mjs
import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const base=process.env.GROUPS_GUIDE_BANNER_BASE??'http://127.0.0.1:3701',out=process.env.GROUPS_GUIDE_BANNER_OUT;assert.ok(out,'GROUPS_GUIDE_BANNER_OUT is required');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),checks=[];
try{for(const [locale,width] of [['ko',390],['ko',1440],['en',390],['en',1440],['ja',390],['ja',1440]]){
 const page=await browser.newPage({viewport:{width,height:1000}});await page.routeWebSocket('**',s=>s.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/pages/groups?locale=${locale}`);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(800);
 const carousel=page.getByRole('region').filter({has:page.locator('[class*=viewport]')}).first();
 const slides=[];const dots=await page.locator('[class*=dots] button').count();
 for(let i=0;i<dots;i++){await page.locator('[class*=dots] button').nth(i).click();await page.waitForTimeout(700);
  const info=await page.evaluate(()=>{const track=document.querySelector('[class*=track]');const active=[...track.children].find(c=>!c.hasAttribute('inert'))??track.children[0];const img=active.querySelector('img'),link=active.querySelector('a');const r=n=>{const b=n.getBoundingClientRect();return [Math.round(b.width),Math.round(b.height)]};return {href:link?.getAttribute('href'),img:{current:img.currentSrc.split('/').pop(),nat:[img.naturalWidth,img.naturalHeight],box:r(img),fit:getComputedStyle(img).objectFit,ok:img.complete&&img.naturalWidth>0},category:active.querySelector('[class*=category]')?.textContent};});
  slides.push(info);if(info.href?.startsWith('/guide'))await carousel.screenshot({path:`${out}/slide-${locale}-${width}-${info.href.split('/')[2].split('?')[0]}.png`});}
 await page.locator('[class*=viewport]').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/top-${locale}-${width}.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 checks.push({locale,width,slides,errors});await page.close();}
 await fs.writeFile(`${out}/checks.json`,JSON.stringify(checks,null,2));console.log(JSON.stringify(checks.map(c=>({l:c.locale,w:c.width,spot:c.spot.images+' imgs / '+c.spot.hrefs.length+' links',slides:c.slides.map(s=>[s.href,s.category,s.img.box.join('x'),s.img.fit,s.img.current,s.img.ok])})),null,0).replace(/\},\{/g,'},\n{'));
}finally{await browser.close();}
