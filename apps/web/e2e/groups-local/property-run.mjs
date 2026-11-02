import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output=process.env.GROUP_PROPERTY_OUTPUT??'/Users/jewel/Desktop/Developement/byus/work/fanpage-alignment-system-20261102/property-render';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),failures=[],errors=[];let page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
const routes=[['directory','/pages/groups'],['home','/nchive'],['board','/nchive?tab=board'],['my','/my'],['wallet','/my/wallet'],['capsules','/my/capsules'],['social','/my/friends?conversationId=e9200000-0000-4000-8000-000000000001'],['video','/nchive?view=video'],['profile','/my/profile'],['mission','/?view=mission'],['collection','/?view=collections'],['event','/?view=event&state=confirmed'],['hobby','/pages/groups/e9200000-0000-4000-8000-000000000003'],['settings','/settings'],['notifications','/notifications'],['admin-settings','/?view=manage&section=settings'],['admin-reports','/?view=manage&section=reports'],['rooms','/nchive?tab=rooms'],['gate-off-home','/elina?groups=off'],['gate-off-my','/my?groups=off'],['history','/my/activity'],['benefits','/benefits'],['calendar','/live/calendar']].filter(([name])=>!process.env.GROUP_PROPERTY_SURFACES||process.env.GROUP_PROPERTY_SURFACES.split(',').includes(name));
try{
 for(const width of [390,1440])for(const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru'])for(const [name,path] of routes){
  if(name===routes[0][0]){await page.close();page=await browser.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));}
  const url=new URL(path,'http://127.0.0.1:3128');url.searchParams.set('locale',locale);
  await page.setViewportSize({width,height:1000});await page.goto(url.href);await page.locator('main, [role="dialog"]').first().waitFor().catch(error=>{throw new Error(`${name}/${locale}/${width}: ${errors.join('; ')} ${error.message}`)});await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,items:[...document.querySelectorAll('main *,[role="dialog"] *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&getComputedStyle(el).position!=='fixed'}).slice(0,8).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,60)}))}));
  if(overflow.document>width+1)failures.push({name,locale,width,...overflow});
  if(locale==='ko')await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true,animations:'disabled'});
 }
 await fs.writeFile(`${output}/checks.json`,JSON.stringify({routes:routes.length,locales:12,widths:[390,1440],failures,errors},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 console.log(`PASS ${routes.length} surfaces × 12 locales × 390/1440: no horizontal overflow or runtime errors`);
}finally{await browser.close();}
