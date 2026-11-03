import {chromium} from '@playwright/test';
import ts from 'typescript';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='/Users/jewel/Desktop/Developement/byus/work/fanpage-alignment-system-20261102/source-panels-render',properties='/Users/jewel/Desktop/Developement/byus/work/fanpage-alignment-system-20261102/properties';
await fs.mkdir(output,{recursive:true});
const nodes=['fMkHm','Vgw4h'];
for(const file of ['source-result-panel.tsx','source-flow-panel.tsx','source-secondary-panel.tsx','source-activity-panels.tsx','source-community-panels.tsx']){
 const source=ts.createSourceFile(file,await fs.readFile(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText().startsWith('SOURCE_')&&n.name.getText().endsWith('_PANELS')){let v=n.initializer;while(v&& !ts.isObjectLiteralExpression(v))v=v.expression;if(v)nodes.push(...v.properties.map(p=>p.name.text));}ts.forEachChild(n,visit);}visit(source);
}
const browser=await chromium.launch({headless:true}),results=[],errors=[];let page=await browser.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
try{for(const width of [1440,390])for(const [index,id] of nodes.entries()){
 if(index%10===0){await page.close();page=await browser.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));}
 await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:3128/nchive?locale=ko&state=${id}`,{timeout:60000});
 const panel=page.locator(`[data-source-node="${id}"],[data-source-flow="${id}"],[data-source-community="${id}"]`);await panel.waitFor();await page.evaluate(()=>document.fonts.ready);
 const source=JSON.parse(await fs.readFile(`${properties}/${id}.json`,'utf8'));
 const result=await panel.evaluate(el=>{const css=getComputedStyle(el),layout=el.querySelector('.sourceResultPanelContent,.sourceWalletStateContent')??el;return {width:el.getBoundingClientRect().width,padding:css.padding,borderRadius:css.borderRadius,gap:getComputedStyle(layout).gap,text:[el.textContent,...[...el.querySelectorAll('input,textarea')].map(input=>[input.value,input.placeholder].join(" "))].join(' '),overflow:document.documentElement.scrollWidth>innerWidth+1,contentOverflow:el.scrollWidth>el.clientWidth+1,focusInside:!!el.closest('dialog')?.contains(document.activeElement)}});
 const normalize=s=>s.replace(/\s+/g,'').trim();const missing=source.nodes.filter(n=>n.text?.trim()).map(n=>n.text).filter(text=>!normalize(result.text).includes(normalize(text)));
 results.push({id,viewport:width,...result,text:undefined,missing});
 if(width===1440){const css=Object.fromEntries(source.nodes[0].style.split(';').map(rule=>{const i=rule.indexOf(':');return [rule.slice(0,i).trim(),rule.slice(i+1).trim()]}));assert.equal(result.width,parseFloat(css.width),`${id} root width`);assert.equal(result.padding,css.padding??'0px',`${id} root padding`);assert.equal(result.borderRadius,css['border-radius']??'0px',`${id} radius`);if(css.gap)assert.equal(result.gap,css.gap,`${id} gap`);}
 assert.equal(result.overflow,false,`${id}/${width} overflow`);assert.equal(result.contentOverflow,false,`${id}/${width} content overflow`);assert.deepEqual(missing,[],`${id}/${width} missing source text`);
 await panel.screenshot({path:`${output}/${id}-${width}.png`,animations:'disabled'});
 await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
 }assert.deepEqual(errors,[]);console.log(`PASS ${nodes.length} exact source panels ×2 widths: root properties, complete text, overflow, Escape`);
}finally{await fs.writeFile(`${output}/checks.json`,JSON.stringify({results,errors},null,2));await browser.close();}
