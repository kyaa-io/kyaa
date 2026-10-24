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
 const source=await readFile(path.join(web,'i18n/locales.ts'),'utf8');
 const locales=[...source.match(/APP_LOCALES\s*=\s*\[([^\]]+)/s)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 assert(locales.length>0);
 for(const width of [360,390,768,1440]) for(const locale of locales) {
  if((width===360||width===768)&&!['ko','ja','vi','th'].includes(locale))continue;
  await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:4199/?locale=${locale}`);
  await expect(page.locator('article')).toHaveCount(4);
  await expect.poll(()=>page.locator('article img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  const geometry=await page.locator('article').evaluateAll(cards=>cards.map(card=>{
   const header=card.querySelector('header'), button=header.querySelector('button'), date=card.querySelector('time'), photo=card.querySelector('img[alt]:not([alt=""])'), body=card.querySelector('p');
   const r=e=>e.getBoundingClientRect();
   return {menuAligned:Math.abs(r(button).top-r(header).top)<1, target:r(button).width>=44&&r(button).height>=44,dateBelow:!photo||r(date).top>=r(photo).bottom,dateAligned:!photo||Math.abs(r(date).right-r(photo).right)<1,bodyBelow:!photo||r(body).top>=r(date).bottom,ratio:!photo||Math.abs(r(photo).width/r(photo).height-photo.naturalWidth/photo.naturalHeight)<0.02};
  }));
  assert(geometry.every(g=>Object.values(g).every(Boolean)),JSON.stringify({width,locale,geometry}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));matrix.push({width,locale});
  if(locale==='ko'&&[390,1440].includes(width)){ await page.screenshot({path:path.join(out,`ko-${width}.png`),fullPage:true}); await page.locator('article').first().screenshot({path:path.join(out,`card-${width}.png`)}); }
 }
 await page.setViewportSize({width:390,height:1000});await page.goto('http://127.0.0.1:4199/?locale=ko');
 const trigger=page.locator('article').first().locator('header button');await trigger.focus();await trigger.press('Enter');
 const item=page.getByRole('menuitem').first();await expect(item).toBeVisible();await page.keyboard.press('ArrowDown');
 assert(await page.getByRole('menuitem').evaluateAll(items=>items.some(el=>getComputedStyle(el).outlineStyle==='solid')));
 await page.screenshot({path:path.join(out,'menu-390.png')});await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 assert.deepEqual((await new AxeBuilder({page}).analyze()).violations,[]);
 await page.goto('http://127.0.0.1:4199/?locale=ko&auth=off');await expect(page.locator('article header button')).toHaveCount(0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'evidence.json'),JSON.stringify({matrix,errors,axe:'pass',menu:'pass'},null,2));console.log(`PASS ${matrix.length} layout cases; image ratios, menu/focus and Axe`);
 }finally{await browser.close();await server.close();}
}
