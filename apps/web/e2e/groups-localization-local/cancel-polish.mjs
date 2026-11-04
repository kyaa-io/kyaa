import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const web=new URL('../../',import.meta.url),out=new URL('./artifacts/cancel-polish/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const locales=JSON.parse((await fs.readFile(new URL('i18n/locales.ts',web),'utf8')).match(/APP_LOCALES = (\[[^;]+\]) as const/)[1]);
const browser=await chromium.launch(),checks=[];
try{
 for(const width of [390,1440])for(const locale of locales)for(const view of ['photo','review']){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:3136/?view=${view}&locale=${locale}`);
  const button=page.locator('.sourceTaskActions>button').first();await button.waitFor();await page.evaluate(()=>document.fonts.ready);
  const metrics=await button.evaluate(e=>{const label=e.querySelector('span');return{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,label:label.textContent,labelHeight:label.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(label).lineHeight),padding:getComputedStyle(e).paddingInline,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(metrics.width>=44&&metrics.height>=44);assert.ok(metrics.labelHeight<=metrics.lineHeight+.5,JSON.stringify({width,locale,view,metrics}));assert.equal(metrics.overflow,false);assert.deepEqual(errors,[]);
  const capture=`${view}-${locale}-${width}.png`;await page.screenshot({path:fileURLToPath(new URL(capture,out))});
  checks.push({width,locale,view,metrics,capture});await fs.writeFile(new URL('checks.json',out),JSON.stringify(checks,null,2));await page.close();
 }
 assert.equal(checks.length,locales.length*4);console.log(JSON.stringify({passed:checks.length,out:fileURLToPath(out)}));
}finally{await browser.close();}
