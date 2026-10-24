import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium,expect } from '@playwright/test';
import sharp from 'sharp';
import { startHarness,state } from './server.mjs';
const out=path.resolve(process.env.PHOTO_EVIDENCE_DIR ?? 'apps/web/test-results/community-photo-local');
const source=await readFile(new URL('../../i18n/catalogs/features__fan_posts__ui.ts',import.meta.url),'utf8');
const messages=JSON.parse(source.slice(source.indexOf('= {')+2,source.indexOf('} as const;')+1));
const photo=await sharp({create:{width:640,height:480,channels:3,background:'#d6a6ee'}}).jpeg().toBuffer();
await mkdir(out,{recursive:true});const server=await startHarness(),browser=await chromium.launch(),checks=[];
try { for(const width of [390,1440]) for(const [locale,copy] of Object.entries(messages)) {
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.goto(`http://127.0.0.1:4217/?locale=${locale}`);
 await expect(page.getByText(copy.photoUploadHint,{exact:false})).toBeVisible();
 state.fail=true;
 await page.locator('input[type=file]').setInputFiles({name:'photo.jpg',mimeType:'image/jpeg',buffer:photo});
 await expect(page.getByRole('alert')).toHaveText(copy.photoUploadFailed);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(out,`locale-${locale}-${width}.png`),fullPage:true});
 checks.push({locale,width,localizedHint:true,localizedFailure:true,overflow:false});await page.close();
 } await writeFile(path.join(out,'locales.json'),JSON.stringify(checks,null,2));console.log('PASS 11 locales at 390/1440: photo hint, failure recovery copy, no horizontal overflow');
}finally{await browser.close();await server.close();}
