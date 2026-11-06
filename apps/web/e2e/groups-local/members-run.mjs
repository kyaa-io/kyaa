import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.env.GROUP_MEMBERS_SCREENSHOTS??'/Users/jewel/Desktop/Developement/byus/work/kyaa-groups-production-20261101/members-render';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:3128/?view=detail&tab=members&locale=ko');
  await page.getByRole('link',{name:/별빛.*프로필 보기/}).waitFor();
  assert.equal(await page.locator('section').filter({has:page.locator('#group-people-title')}).getByRole('navigation').getByRole('button').count(),3);
  const rows=page.locator('a[href*="/my/friends?locale="]');assert.equal(await rows.count(),4);
  const boxes=await rows.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,bottom:r.bottom,width:r.width};}));
  if(width===1440){assert.ok(Math.abs(boxes[0].y-boxes[1].y)<=1);assert.ok(Math.abs(boxes[0].bottom-boxes[1].bottom)<=1);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${output}/members-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'더 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('a[href*="/my/friends?locale="]').length===8);
  await page.getByRole('button',{name:'내 친구',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('a[href*="/my/friends?locale="]').length===4);
  assert.ok((await rows.first().getAttribute('href')).includes('profileId='));
  await page.getByRole('button',{name:'팬랭킹',exact:true}).click();await page.getByText('팬 점수 2,400').waitFor();
  await page.screenshot({path:`${output}/ranking-${width}.png`,fullPage:true});
  await page.getByRole('searchbox',{name:'회원 검색'}).fill('별빛');await page.getByRole('button',{name:'검색',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('a[href*="/my/friends?locale="]').length===1);
  await page.getByRole('searchbox',{name:'회원 검색'}).focus();assert.notEqual(await page.getByRole('searchbox').evaluate(n=>getComputedStyle(n).outlineStyle),'none');
 }
 for(const state of ['empty','error','threshold']){
  await page.goto(`http://127.0.0.1:3128/?view=detail&tab=members&locale=ko&state=${state}`);
  if(state==='error'){await page.getByRole('alert').waitFor();continue;}
  await page.getByRole('button',{name:'팬랭킹',exact:true}).click();await page.getByText(state==='threshold'?'활동한 팬 100명부터 랭킹이 열려요.':'조건에 맞는 회원이 없어요.').waitFor();
 }
 assert.deepEqual(errors,[]);console.log('PASS members 390/1440: 3 modes, real links, search, n+1 pagination, aligned cards, focus, no overflow, empty/error/threshold');
}finally{await browser.close();}
