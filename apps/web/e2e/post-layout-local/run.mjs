// Product cards with synthetic auth/content; never writes to production.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { createServer }=await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const here=import.meta.dirname, web=path.resolve(here,'../..'), root=path.resolve(web,'../..');
const out=process.env.POST_LAYOUT_OUTPUT ?? path.join(root,'work/post-layout');
await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,root:here,publicDir:path.join(web,'public'),cacheDir:path.join(out,'vite'),esbuild:{jsx:'automatic'},resolve:{alias:[
 {find:'@/features/auth/client/cognito-auth',replacement:path.join(here,'../community-stamps-local/privy.ts')},
 {find:'@/components/byus-session-provider',replacement:path.join(here,'../translation-local/session.ts')},
 {find:'@',replacement:web}, {find:'next/link',replacement:path.join(here,'../mission-local/next-link.tsx')}
]},plugins:[{name:'post-images',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/api/content-assets/'))return next();
 const file=req.url.endsWith('1')?'live/kara-hero-group.jpg':req.url.endsWith('2')?'celebrities/yuna/hero-studio-mobile.jpg':'guest-home/elina-card.jpg';
 res.setHeader('Content-Type','image/jpeg');res.end(await readFile(path.join(web,'public/images',file)));
});}}],server:{host:'127.0.0.1',port:4199,strictPort:true,fs:{allow:[root]}}});
await server.listen();
if(process.argv.includes('--serve')) {console.log('http://127.0.0.1:4199');} else {
 const browser=await chromium.launch({headless:true}), context=await browser.newContext(), page=await context.newPage();
 const errors=[],matrix=[];page.on('pageerror',e=>errors.push(e.message));
 try {
 let translationFails=true;
 await page.route('**/api/content-translations',route=>route.fulfill(translationFails
  ? {status:503,json:{error:{code:'TRANSLATION_FAILED'}}}
  : {json:{...route.request().postDataJSON(),locale:undefined,translatedText:'오늘 밤 콘서트에서 여러분을 만날 생각에 정말 설레요!',sourceRevision:1,cached:false}}));
 const source=await readFile(path.join(web,'i18n/locales.ts'),'utf8');
 const locales=[...source.match(/APP_LOCALES\s*=\s*\[([^\]]+)/s)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 assert(locales.length>0);
 for(const width of [360,390,768,1440]) for(const locale of locales) {
  if((width===360||width===768)&&!['ko','ja','vi','th'].includes(locale))continue;
  await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:4199/?locale=${locale}`);
  await expect(page.locator('article')).toHaveCount(4);
  await expect(page.locator('article img[alt]:not([alt=""])')).toHaveCount(3);
  await expect.poll(()=>page.locator('article img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  const geometry=await page.locator('article').evaluateAll(cards=>cards.map(card=>{
   const header=card.querySelector('header'), button=header.querySelector('button'), date=card.querySelector('time'), photo=card.querySelector('img[alt]:not([alt=""])'), body=card.querySelector('p');
   const r=e=>e.getBoundingClientRect();
   const footer=date.parentElement, actions=footer.querySelectorAll('button,a');
   return {menuAligned:Math.abs(r(button).top-r(header).top)<1, target:[button,...actions].every(action=>r(action).width>=44&&r(action).height>=44),dateBelow:r(date).top>=r(body).bottom,dateAligned:Math.abs(r(date).right-r(card).right)<1,dateInFooter:footer.contains(card.querySelector('button[aria-pressed]:has(svg)')),noOverlap:[...actions].every(action=>r(date).left>=r(action).right||r(date).top>=r(action).bottom),bodyBelow:photo?r(body).top>=r(photo).bottom:Math.abs(r(body).top-r(header).bottom-8)<1,ratio:!photo||Math.abs(r(photo).width/r(photo).height-photo.naturalWidth/photo.naturalHeight)<0.02};
  }));
  assert(geometry.every(g=>Object.values(g).every(Boolean)),JSON.stringify({width,locale,geometry}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));matrix.push({width,locale});
  if(locale==='ko'&&[390,1440].includes(width)){ await page.screenshot({path:path.join(out,`ko-${width}.png`),fullPage:true}); await page.locator('article').first().screenshot({path:path.join(out,`card-${width}.png`)}); await page.locator('article').last().screenshot({path:path.join(out,`text-${width}.png`)}); }
 }
 await page.setViewportSize({width:390,height:1000});await page.goto('http://127.0.0.1:4199/?locale=ko');
 const trigger=page.locator('article').first().locator('header button');await trigger.focus();await trigger.press('Enter');
 const item=page.getByRole('menuitem').first();await expect(item).toBeVisible();await page.keyboard.press('ArrowDown');
 assert(await page.getByRole('menuitem').evaluateAll(items=>items.some(el=>getComputedStyle(el).outlineStyle==='solid')));
 await page.screenshot({path:path.join(out,'menu-390.png')});await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 assert.deepEqual((await new AxeBuilder({page}).analyze()).violations,[]);
 translationFails=false;await page.goto('http://127.0.0.1:4199/?locale=ko');
 const translated=page.locator('article').nth(1);await translated.scrollIntoViewIfNeeded();
 await expect(translated.getByRole('button',{name:'원문 보기'})).toBeVisible();
 await expect(translated.locator('p')).toHaveText('오늘 밤 콘서트에서 여러분을 만날 생각에 정말 설레요!');
 assert(await translated.evaluate(card=>card.querySelector('time').getBoundingClientRect().top>=card.querySelector('p').getBoundingClientRect().bottom));
 await translated.getByRole('button',{name:'원문 보기'}).click();
 await expect(translated.locator('p')).toHaveText('We are so excited to see everyone at the concert tonight!');
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:4199/?locale=ko&detail=true');
  await expect(page.locator('article a')).toHaveCount(0);
  assert(await page.locator('article').evaluateAll(cards=>cards.every(card=>{const date=card.querySelector('time'),body=card.querySelector('p');return date.parentElement.contains(card.querySelector('button[aria-pressed]:has(svg)'))&&date.getBoundingClientRect().top>=body.getBoundingClientRect().bottom&&Math.abs(date.getBoundingClientRect().right-card.getBoundingClientRect().right)<1;})));
 }
 await page.goto('http://127.0.0.1:4199/?locale=ko&auth=off');await expect(page.locator('article header button')).toHaveCount(0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'evidence.json'),JSON.stringify({matrix,errors,axe:'pass',menu:'pass',detail:'pass',translation:'pass'},null,2));console.log(`PASS ${matrix.length} layout cases; detail, translation, image ratios, menu/focus and Axe`);
 }finally{await browser.close();await server.close();}
}
