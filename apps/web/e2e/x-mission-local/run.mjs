import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
 for (const locale of ['ko','en']) for (const width of [390,1440]) for (const state of ['guest','in','done','error']) {
  const page = await browser.newPage({ viewport:{width,height:900}, reducedMotion:'reduce' });
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto(`http://localhost:4207/?locale=${locale}&state=${state}`);
  await page.getByRole('heading',{level:1}).waitFor();
  if(state==='error') await page.getByRole('button',{name:locale==='ko'?'다시 시도':'Try again'}).waitFor();
  else await page.getByText(locale==='ko'?/좋아요 ·/:/Likes ·/).waitFor();
  if(state==='in') {
   const button=page.getByRole('button',{name:locale==='ko'?'좋아요':'Like',exact:true});
   await button.click();
   await page.getByRole('heading',{name:locale==='ko'?'미션 완료':'Mission complete'}).waitFor();
   assert(await page.getByRole('button',{name:locale==='ko'?'미션 완료':'Mission complete'}).isDisabled());
   await page.getByText(locale==='ko'?'좋아요 · 8':'Likes · 8').waitFor();
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow');
  assert(await page.locator('main a, main button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44&&n.getBoundingClientRect().width>=44)),'touch target');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('16 locale/viewport/state combinations passed; like → completion/server count, overflow, touch targets, no runtime errors');
} finally { await browser.close(); }
