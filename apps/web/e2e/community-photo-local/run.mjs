import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { chromium, webkit, expect } from '@playwright/test';
import { startHarness, state } from './server.mjs';
const out = path.resolve(process.env.PHOTO_EVIDENCE_DIR ?? 'apps/web/test-results/community-photo-local');
await mkdir(out,{recursive:true});
const jpeg = await sharp(randomBytes(2000*3000*3),{raw:{width:2000,height:3000,channels:3}}).jpeg({quality:97}).withMetadata({orientation:6}).toBuffer();
const png = await sharp(randomBytes(1600*2000*4),{raw:{width:1600,height:2000,channels:4}}).png().toBuffer();
for (const bytes of [jpeg,png]) assert(bytes.length>4_500_000 && bytes.length<=20*1024*1024);
await writeFile(path.join(out,'source.jpg'),jpeg); await writeFile(path.join(out,'source.png'),png);
const server = await startHarness(), evidence=[];
try {
 for (const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch();
 try { for (const width of [390,1440]) {
 const page=await browser.newPage({viewport:{width,height:1000}});
 state.assets.clear();state.uploads=[];state.posted=null;state.fail=false;
 const uploads=state.uploads;
 await page.goto('http://127.0.0.1:4217');
 await page.getByRole('textbox').fill('사진과 함께 남기는 커뮤니티 이야기');
 const input=page.getByLabel('사진 추가',{exact:true});
 await input.setInputFiles([{name:'camera.jpg',mimeType:'image/jpeg',buffer:jpeg},{name:'transparent.png',mimeType:'image/png',buffer:png}]);
 await expect(page.locator('button[type=submit]')).toBeDisabled();
 await expect(page.getByRole('button',{name:'게시',exact:true})).toBeEnabled({timeout:30000});
 assert.equal(uploads.length,2); assert(uploads.every(x=>x.bytes<4_500_000));
 assert.equal(uploads[0].width/uploads[0].height,1.5); assert.equal(uploads[1].width/uploads[1].height,0.8); assert.equal(uploads[1].alpha,true);
 await expect(page.getByRole('img')).toHaveCount(2);
 await page.screenshot({path:path.join(out,`${engineName}-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'게시',exact:true}).click(); await expect(page.getByRole('status')).toHaveText('게시 완료');
 assert.equal(state.posted.assetIds.length,2); assert.equal(state.posted.body,'사진과 함께 남기는 커뮤니티 이야기');
 // A failed upload preserves the draft and retries without choosing the file again.
 await page.reload(); await page.getByRole('textbox').fill('실패해도 보존되는 작성 내용'); state.fail=true;
 await input.setInputFiles({name:'camera.jpg',mimeType:'image/jpeg',buffer:jpeg}); await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByRole('textbox')).toHaveValue('실패해도 보존되는 작성 내용'); state.fail=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click(); await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByRole('button',{name:'사진 추가 · 1/4'})).toBeEnabled({timeout:30000});
 await expect(page.getByRole('alert')).toHaveCount(0);
 evidence.push({engine:engineName,width,sourceBytes:[jpeg.length,png.length],uploads,postedAssets:state.posted.assetIds.length,retry:true});
 await page.close();
 }} finally {await browser.close();}
 }
 await writeFile(path.join(out,'evidence.json'),JSON.stringify({scope:'Real browser/composer/conversion; synthetic auth and API with 4.5 MB request ceiling',checks:evidence},null,2));
 console.log('PASS Chromium/WebKit 390/1440: large JPEG/PNG, EXIF rotation, alpha, publish, pending lock and retry');
} finally {await server.close();}
