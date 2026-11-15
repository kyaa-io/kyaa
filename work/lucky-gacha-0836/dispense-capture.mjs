import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try { for(const width of [390,1440]) {
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.goto('http://127.0.0.1:3186/');
 await page.locator('[data-preview-enabled] button').click();
 await page.waitForFunction(()=>document.querySelector('[role=dialog] canvas')?.getAttribute('data-gl-geometries'));
 await page.getByRole('dialog').getByRole('button',{name:'Coming soon',exact:true}).click();
 await page.waitForTimeout(5800);
 await page.screenshot({path:`work/lucky-gacha-0836/dispense-${width}.png`});
 await page.close();
}} finally {await browser.close()}
