import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{const native=requestAnimationFrame;let time=0;window.frameCalls=0;window.requestAnimationFrame=cb=>native(()=>{window.frameCalls++;cb(time+=1000)})});
 await page.goto('http://127.0.0.1:3187/');
 await page.waitForFunction(()=>document.querySelector('[data-lucky-stage]')?.getAttribute('data-lucky-graphics')==='3d',null,{polling:10});
 const initial=await page.evaluate(()=>window.frameCalls);
 await page.waitForTimeout(1200);
 const result=await page.evaluate(()=>({hasCanvas:!!document.querySelector('canvas'),graphics:document.querySelector('[data-lucky-stage]')?.getAttribute('data-lucky-graphics'),frames:window.frameCalls}));
 result.initialFrames=initial;result.simulatedFrameSeconds=1;
 const suffix=process.argv[2]??'before';
 await page.screenshot({path:`work/lucky-gacha-stops-0910/slow-${suffix}-390.png`});
 await fs.writeFile(`work/lucky-gacha-stops-0910/slow-${suffix}.json`,JSON.stringify(result,null,2));
 if(suffix==='after'){assert.equal(result.hasCanvas,false);assert.equal(result.graphics,'still');}
 console.log(result);
}finally{await browser.close()}
