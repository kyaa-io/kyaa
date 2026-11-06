// Captures the directory list column (controls + empty/error panel) for before/after review. Usage: OUT=<dir> TAG=before|after node groups-directory-state-run.mjs
import {chromium} from '@playwright/test';import fs from 'node:fs/promises';
const base=process.env.GROUPS_GUIDE_BANNER_BASE??'http://127.0.0.1:3701',out=process.env.OUT,tag=process.env.TAG??'after';await fs.mkdir(out,{recursive:true});
const cases=[['empty-fan-actor','/pages/groups?locale=ko&type=fan&artistRole=actor'],['empty-search','/pages/groups?locale=ko&type=hobby&search=zzzz'],['error-list','/pages/groups?locale=ko&state=error&type=hobby']];
const browser=await chromium.launch();
try{for(const [name,target] of cases)for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}});await page.routeWebSocket('**',s=>s.close());await page.goto(`http://127.0.0.1:3701${target}`.replace('http://127.0.0.1:3701',base));await page.waitForTimeout(1000);
 const info=await page.evaluate(()=>{const panel=document.querySelector('[data-source-state="nHfwZ"],[data-source-state="J4WKn"]');if(!panel)return null;const col=panel.parentElement,r=panel.getBoundingClientRect(),c=col.getBoundingClientRect();return {panel:[Math.round(r.left),Math.round(r.right)],column:[Math.round(c.left),Math.round(c.right)]};});
 const column=page.locator('[data-source-state="nHfwZ"],[data-source-state="J4WKn"]').first().locator('..');
 await column.screenshot({path:`${out}/${name}-${width}-${tag}.png`});console.log(tag,name,width,JSON.stringify(info));await page.close();}}finally{await browser.close();}
