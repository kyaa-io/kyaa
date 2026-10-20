import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startHarness } from './server.mjs';
const harness=await startHarness(4199),browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const url=`${harness.baseURL}/kyaa-wave-fanpage/programs/live-insight?locale=ko`;
 await page.goto(url);await page.getByLabel('댓글 남기기',{exact:true}).fill('프로그램 참여 댓글');await page.getByRole('button',{name:'등록',exact:true}).click();
 await expect(page.getByText('프로그램 참여 댓글',{exact:true})).toBeVisible();await expect(page.locator('[data-earned=true]')).toHaveCount(1);
 await page.goto(url);await page.getByRole('button',{name:'나영석 PD님께 감사평 남기기',exact:true}).click();await page.getByRole('textbox',{name:'나영석 PD님께 감사평 남기기',exact:true}).fill('사진으로 참여');await page.locator('input[type=file][accept^="image/"]').setInputFiles(fileURLToPath(new URL('../../public/images/kyaa-wave/changha-landscape.webp',import.meta.url)));await expect(page.locator('form').first().getByRole('img')).toHaveCount(1);await page.locator('form').first().locator('button[type=submit]').click();await expect(page.getByRole('textbox',{name:'나영석 PD님께 감사평 남기기',exact:true})).toHaveCount(0,{timeout:15000});await expect(page.getByText('사진으로 참여',{exact:true})).toBeVisible();await expect(page.locator('[data-earned=true]')).toHaveCount(1);
 await page.goto(`${url}&save=error`);await page.getByLabel('댓글 남기기',{exact:true}).fill('실패해도 남는 댓글');await page.getByRole('button',{name:'등록',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('댓글 남기기',{exact:true})).toHaveValue('실패해도 남는 댓글');await expect(page.locator('[data-earned=true]')).toHaveCount(0);
 await page.goto(`${url}&state=error`);await expect(page.getByRole('alert').first()).toBeVisible();await expect(page.locator('[data-earned=true]')).toHaveCount(0);
 await page.goto(`${url}&earned=all`);await expect(page.locator('[data-earned=true]')).toHaveCount(1);
 await page.goto(`${url}&auth=off`);await expect(page.locator('a[href*="returnTo="]').first()).toHaveAttribute('href',/programs%2Flive-insight/);
 for(const locale of ['ko','ja','vi','th'])for(const width of [360,768]){await page.setViewportSize({width,height:900});await page.goto(`${url.replace('locale=ko',`locale=${locale}`)}&state=empty`);await expect(page.locator('h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});
 await page.goto(`${harness.baseURL}/kyaa-wave-fanpage?tab=friends&friends=populated&locale=fr`);
 const dm=page.locator('main button').filter({has:page.locator('svg.lucide-message-circle')}).first();
 await dm.click();await expect(page.getByRole('dialog')).toBeVisible();
 assert((await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).fontFamily)).includes('Pretendard'));
 await page.keyboard.press('Escape');await expect(dm).toBeFocused();
 await page.goto(`${harness.baseURL}/kyaa-wave-fanpage?tab=board&section=media&locale=ko`);
 await page.getByRole('button',{name:'전체 보기 · 1/5'}).click();
 const media=page.getByRole('region',{name:'전체 보기',exact:true});
 await expect(media).toHaveAttribute('tabindex','0');
 await page.keyboard.press('Tab');await expect(media).toBeFocused();
 assert.equal(await media.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
 const first=await media.evaluate(el=>el.scrollLeft);await page.keyboard.press('ArrowRight');
 await expect.poll(()=>media.evaluate(el=>el.scrollLeft)).toBeGreaterThan(first);
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'전체 보기 · 1/5'})).toBeFocused();
 await page.locator('main button').filter({has:page.locator('svg.lucide-plus')}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 assert((await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).fontFamily)).includes('Pretendard'));
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineWidth),'3px');
 await page.keyboard.press('Escape');
 console.log('Program actions, narrow layouts, Wave portal fonts, visible focus, album keyboard scroll and focus return passed');await context.close();
} finally {await browser.close();await harness.server.close();}
