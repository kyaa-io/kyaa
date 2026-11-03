import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='/Users/jewel/Desktop/Developement/byus/work/fanpage-alignment-system-20261102',out=`${base}/source-full-pages-render`;
await fs.mkdir(out,{recursive:true});
const ledger=JSON.parse(await fs.readFile('../../docs/design/groups-production-coverage.json','utf8'));
const panels=new Set(JSON.parse(await fs.readFile(`${base}/source-panels-render/checks.json`,'utf8')).results.map(x=>x.id));
const delegated=new Set('t27NTb BDVdq c9Wui6 ykQWh zcRQc FP2ON xzfqF n325b KUEOR XCSLO F0pbG9 G5Sebj Urthu wCL5S S38b4C U3Bip g9zuQV'.split(' '));
const filter=process.env.SOURCE_ROOTS?.split(',');
const rows=ledger.rows.filter(r=>(!filter||filter.includes(r.id))&&r.classification==='product'&&!panels.has(r.id)&&!delegated.has(r.id)&&r.id!=='kqlrO');
const browser=await chromium.launch(),checks=[],failures=[];
try{for(const row of rows){for(const width of [...new Set([390,1440,row.sourceWidth>=320?row.sourceWidth:1440])]){if(!width)continue;const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{await page.goto(new URL(row.localRoute,'http://127.0.0.1:3128').href);await page.locator('main').first().waitFor();await page.evaluate(()=>document.fonts.ready);
if(['qI1DJ','VJgwi','FUmMO','o8602','rRHiT'].includes(row.id)){await page.locator('summary[aria-label]').click();if(['qI1DJ','VJgwi'].includes(row.id))await page.getByRole('button',{name:'접속 상태 공개',exact:true}).click();}
if(row.id==='QyrvD')await page.getByRole('button',{name:'게시글',exact:true}).click();
if(row.id==='XnL4z')await page.locator('main button[aria-haspopup=menu]').click();
if(row.id==='qADEF')await page.getByRole('button',{name:'다음 배너',exact:true}).click();
if(row.id==='EU2Nf'){await page.locator('main button[class*=roomCard]').first().click();await page.locator('input[maxlength="2000"]').waitFor();}
if(row.id==='z27SWk')await page.getByRole('button',{name:'가입하기',exact:true}).click();
const metrics=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,headings:[...document.querySelectorAll('main h1,main h2,dialog h2')].filter(e=>e.getBoundingClientRect().width).map(e=>{const c=getComputedStyle(e);return {text:e.textContent,fontFamily:c.fontFamily,fontSize:c.fontSize,fontWeight:c.fontWeight,lineHeight:c.lineHeight}})}));
assert.ok(metrics.documentWidth<=width+1,`overflow ${metrics.documentWidth}/${width}`);assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${row.id}-${width}.png`,fullPage:true,animations:'disabled'});checks.push({id:row.id,width,route:row.localRoute,metrics});console.log(`PASS ${row.id} ${width}`);
}catch(e){failures.push({id:row.id,width,error:String(e),errors});console.log(`FAIL ${row.id} ${width}: ${String(e)}`);}finally{await page.close();}}
}if(filter){const prior=JSON.parse(await fs.readFile(`${out}/checks.json`,'utf8'));checks.push(...prior.checks.filter(x=>!filter.includes(x.id)));failures.push(...prior.failures.filter(x=>!filter.includes(x.id)));}await fs.writeFile(`${out}/checks.json`,JSON.stringify({checks,failures},null,2));assert.deepEqual(failures,[]);}finally{await browser.close();}
