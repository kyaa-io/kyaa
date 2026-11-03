import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const output=process.env.GROUPS_QA_OUTPUT??'test-results/groups-text-zoom';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
try {
 for(const view of ['directory','apply','my']) {
  await page.goto(`http://127.0.0.1:3128/?view=${view}&locale=ko`);
  await page.locator('main h1').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[role="status"]')?.textContent?.includes('불러오는'));
  await page.evaluate(()=>{
   const nodes=[...document.querySelectorAll('body *')].filter(node=>node instanceof HTMLElement);
   const sizes=nodes.map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);
   for(const [node,size]of sizes)node.style.setProperty('font-size',`${size*2}px`,'important');
  });
  const issues=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clippedControls:[...document.querySelectorAll('button,a,input,select,textarea')].filter(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return Boolean(node.textContent?.trim())&&r.width>0&&r.height>0&&style.visibility!=='hidden'&&node.scrollWidth>node.clientWidth+2&&!['input','textarea','select'].includes(node.tagName.toLowerCase());}).map(node=>node.textContent?.trim())}));
  await page.screenshot({path:`${output}/${view}-200pct-390.png`,fullPage:false});
  assert.equal(issues.overflow,false,`${view}: page overflow at 200% text`);
  assert.deepEqual(issues.clippedControls,[],`${view}: clipped action text`);
  console.log(`PASS ${view}: 390px, 200% text, no page overflow or clipped action text`);
 }
} finally {await browser.close();}
