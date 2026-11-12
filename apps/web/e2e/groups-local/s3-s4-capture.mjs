import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const notes=path.join(root,'release-notes/images');
await mkdir(notes,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 for(const width of [390,1440]){
  for(const [period,label,count] of [['today','오늘',3],['week','7일',7],['month','한 달',10]]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:900},deviceScaleFactor:1});
   await page.goto('http://127.0.0.1:3128/pages/groups?locale=ko&hotFixture=1');
   const chips=page.locator('[data-directory-block="hot-posts"] [data-fan-select-pill]');
   if(period!=='week'){await chips.first().click();await page.getByRole('menuitemradio',{name:label}).click();}
   await page.getByRole('button',{name:`기간: ${label}`}).waitFor();await page.waitForTimeout(220);
   await page.locator('[data-row="hot-post"]').first().waitFor();
   const result=await page.evaluate(async selected=>(await fetch(`/api/public/popular-posts?locale=ko&page=1&sort=likes&period=${selected}`).then(r=>r.json())).items,period);
   if(result.length!==count)throw Error(`${period}: ${result.length} posts`);
   const icons=await chips.evaluateAll(elements=>elements.map(e=>({path:e.querySelector('svg path')?.getAttribute('d'),transform:getComputedStyle(e.querySelector('svg')).transform})));
   if(icons.length!==2||!icons[0].path||icons[0].path!==icons[1].path||icons[0].transform!==icons[1].transform)throw Error(`${period}: chevrons differ ${JSON.stringify(icons)}`);
   if(width===1440&&period!=='today')await page.getByRole('button',{name:'펼치기'}).click();
   const visible=await page.locator('[data-directory-block="hot-posts"] [data-row="hot-post"]').count();
   if(visible!==Math.min(count,width===390?5:period==='today'?5:10)||await page.locator('[data-directory-block="hot-posts"] [data-row="hot-placeholder"]').count())throw Error(`${period} ${width}: ${visible} actual rows or filler`);
   if(width===390)await page.locator('[data-directory-block="hot-posts"]').evaluate(element=>window.scrollTo(0,element.getBoundingClientRect().top+window.scrollY-80));
   const output=path.join(notes,period==='week'?`2026-11-12-hot-period-${width}.png`:`2026-11-13-hot-${period}-${width}.png`);
   await page.screenshot({path:output});console.log(`PASS Hot ${period} ${width}: ${count} rows, same chevron, ${output}`);await page.close();
  }
  const page=await browser.newPage({viewport:{width,height:width===390?844:900},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:3128/settings?locale=ko&section=blocked&s3Preview=1');
  const button=page.getByRole('button',{name:'차단 해제: 예시 팬'});await button.waitFor();
  const layout=await page.evaluate(()=>({headings:[...document.querySelectorAll('h1,h2,h3')].filter(e=>e.textContent?.trim()==='작성자 차단').length,row:document.querySelector('button[aria-label^="차단 해제"]')?.closest('li')?.getBoundingClientRect().height,avatar:document.querySelector('button[aria-label^="차단 해제"]')?.closest('li')?.querySelector('img')?.width,common:document.querySelector('button[aria-label^="차단 해제"]')?.hasAttribute('data-fan-action')}));
  if(layout.headings!==1||layout.row!==56||layout.avatar!==40||!layout.common)throw Error(`S3 ${width}: ${JSON.stringify(layout)}`);
  await page.evaluate(()=>document.activeElement instanceof HTMLElement&&document.activeElement.blur());
  const output=path.join(notes,`2026-11-13-blocked-${width}.png`);await page.screenshot({path:output});
  await button.click();await page.getByText('차단한 사용자가 없어요.').waitFor();
  console.log(`PASS S3 ${width}: block row and successful unblock, ${output}`);await page.close();
 }
}finally{await browser.close();}
