import {chromium} from '@playwright/test';
import ts from 'typescript';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='/Users/jewel/Desktop/Developement/byus/work/pen-dev-loop-20261102/reextract-current-002';
const output=base+'/panel-render',properties=base+'/properties';await fs.mkdir(output,{recursive:true});
const nodes=JSON.parse(await fs.readFile(base+'/panel-changes.json','utf8')).map(x=>x.id);
const browser=await chromium.launch({headless:true}),results=[],errors=[];let page;
const queue=[1440,390].flatMap(width=>nodes.map(id=>({width,id})));
try{await Promise.all([0,1,2].map(async()=>{const page=await browser.newPage();await page.routeWebSocket('**/*',ws=>ws.close());page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));for(;;){const job=queue.shift();if(!job)break;const {width,id}=job;try{
 await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:3128/nchive?locale=ko&state=${id}`,{timeout:60000});
 const panel=page.locator(`[data-source-node="${id}"],[data-source-flow="${id}"],[data-source-community="${id}"]`);await panel.waitFor();await page.evaluate(()=>document.fonts.ready);
 const source=JSON.parse(await fs.readFile(`${properties}/${id}.json`,'utf8'));
 const result=await panel.evaluate(el=>{const css=getComputedStyle(el),layout=el.querySelector('.sourceResultPanelContent,.sourceWalletStateContent')??el;return {width:el.getBoundingClientRect().width,padding:css.padding,borderRadius:css.borderRadius,gap:getComputedStyle(layout).gap,text:[el.textContent,...[...el.querySelectorAll('input,textarea')].map(input=>[input.value,input.placeholder].join(" "))].join(' '),overflow:document.documentElement.scrollWidth>innerWidth+1,contentOverflow:el.scrollWidth>el.clientWidth+1,focusInside:!!el.closest('dialog')?.contains(document.activeElement)}});
 const normalize=s=>s.replace(/\s+/g,'').trim();const missing=source.nodes.filter(n=>n.text?.trim()).map(n=>n.text).filter(text=>!normalize(result.text).includes(normalize(text)));
 results.push({id,viewport:width,...result,text:undefined,missing});
 const failures=[];try { if(width===1440){const css=Object.fromEntries(source.nodes[0].style.split(';').map(rule=>{const i=rule.indexOf(':');return [rule.slice(0,i).trim(),rule.slice(i+1).trim()]}));assert.equal(result.width,parseFloat(css.width),`${id} root width`);assert.equal(result.padding,css.padding??'0px',`${id} root padding`);assert.equal(result.borderRadius,css['border-radius']??'0px',`${id} radius`);if(css.gap)assert.equal(result.gap,css.gap,`${id} gap`);}
 assert.equal(result.overflow,false,`${id}/${width} overflow`);assert.equal(result.contentOverflow,false,`${id}/${width} content overflow`);assert.deepEqual(missing,[],`${id}/${width} missing source text`);
}catch(error){failures.push(error.message);}results.at(-1).failures=failures;
 await panel.screenshot({path:`${output}/${id}-${width}.png`,animations:'disabled'});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 }catch(error){results.push({id,viewport:width,error:error.message});}}await page.close();}));console.log(JSON.stringify({cases:results.length,failed:results.filter(x=>x.error||x.failures?.length).length,errors}));
}finally{await fs.writeFile(`${output}/checks.json`,JSON.stringify({results,errors},null,2));await browser.close();}
