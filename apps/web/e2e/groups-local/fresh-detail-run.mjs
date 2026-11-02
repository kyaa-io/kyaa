import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='/Users/jewel/Desktop/Developement/byus/work/fanpage-visual-diff-20261102',out=base+'/detail-render';await fs.mkdir(out,{recursive:true});
const rows=JSON.parse(await fs.readFile(base+'/detail-screen-map.json','utf8')),filter=process.env.DETAIL_ROOTS?.split(','),browser=await chromium.launch(),checks=[],failures=[];
for(const row of rows.filter(r=>!filter||filter.includes(r.id))){const width=row.mobile?390:1440,page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.goto(`http://127.0.0.1:3128/nchive?screen=${row.id}`);await page.locator(`[data-detail-screen="${row.id}"]`).waitFor();await page.evaluate(()=>document.fonts.ready);
 const source=JSON.parse(await fs.readFile(base+'/properties/'+row.id+'.json','utf8')),nodes=source.nodes.filter(n=>n.text&&n.name==='화면 제목');
 const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,inputs:[...document.querySelectorAll('form input:not([hidden]),form select,form textarea')].map(el=>({label:el.getAttribute('aria-label'),height:el.getBoundingClientRect().height})),headings:[...document.querySelectorAll('form h1')].map(el=>({text:el.textContent,size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight}))}));
 assert.ok(metrics.scroll<=width+1,`overflow ${metrics.scroll}/${width}`);assert.deepEqual(errors,[]);for(const n of nodes)assert.ok(metrics.headings.some(h=>h.text===n.text));for(const input of metrics.inputs.filter(i=>i.label&&!i.label.includes('직접')))assert.ok(input.height>=24,JSON.stringify(input));
 await page.screenshot({path:`${out}/${row.id}-${width}.png`,fullPage:true,animations:'disabled'});checks.push({id:row.id,code:row.code,width,metrics});console.log('PASS',row.id);
}catch(error){failures.push({id:row.id,error:String(error),errors});console.log('FAIL',row.id,String(error));}finally{await page.close();}}
await browser.close();await fs.writeFile(out+'/checks.json',JSON.stringify({checks,failures},null,2));assert.deepEqual(failures,[]);
