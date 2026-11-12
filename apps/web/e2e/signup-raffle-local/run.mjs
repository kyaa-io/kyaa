import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const results = [];
await mkdir('release-notes/images', { recursive: true });
try {
 for (const locale of ['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru']) for (const width of [390,768,1440]) for (const banner of [false,true]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:4198/?locale=${locale}${banner?'&banner=1':''}`);
  await page.locator(banner?'[data-managed-home-banner]':'h1').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.images].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete&&i.naturalWidth>0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `${locale}/${width}/${banner}: overflow`);
  const targets=await page.locator('a,button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
  assert(targets.every(t=>t.height>=44&&t.width>=44), `${locale}/${width}: touch target`);
  assert.deepEqual(errors,[]);
  if(locale==='ko'&&width!==768) await page.screenshot({path:`release-notes/images/2026-11-12-signup-raffle-${banner?'banner':'detail'}-${width}.png`,fullPage:true});
  results.push({locale,width,banner,overflow:false,imagesLoaded:true,targets});
  await page.close();
 }
 await mkdir('work/signup-raffle',{recursive:true});
 await writeFile('work/signup-raffle/ui-checks.json',JSON.stringify({boundary:'Actual production content/banner and CSS, guest auth adapter and loopback fixture; no actual DEV/production API or shell.',results},null,2));
 console.log(`${results.length} combinations passed`);
} finally { await browser.close(); }
