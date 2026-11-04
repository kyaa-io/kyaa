import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base='http://127.0.0.1:5196',out=path.resolve('e2e/groups-benefits-local/evidence');await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const id='10000000-0000-4000-8000-000000000001';
for(const [name,route]of Object.entries({benefits:'/benefits',capsule:'/my/capsules',raffle:`/pages/groups/${id}/raffles/${id}`}))for(const width of [390,1440]){
 await page.setViewportSize({width,height:1000});await page.goto(base+route+'?locale=ko');await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,`initial-${name}-${width}.png`),fullPage:true});console.log(name,width,await page.locator('main').innerText());
}
console.log({errors});await browser.close();
