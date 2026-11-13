import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({locale:'ko-KR',viewport:{width:390,height:844}});
 await page.addInitScript(()=>{window.fixtureEvents=[];window.addEventListener('mission-fixture-event',event=>window.fixtureEvents.push(event.detail));});
 const campaign='utm_source=x&utm_medium=kol&utm_campaign=kol-1113&utm_content=kol01';
 await page.goto(`http://localhost:4207/?state=guest&${campaign}#steps`);
 await page.getByRole('link',{name:'Google로 로그인'}).waitFor();
 assert.equal(await page.locator('main').getAttribute('lang'),'ko');
 const lang=new URL(await page.getByRole('link',{name:'EN',exact:true}).getAttribute('href'),'https://kyaa.io');
 assert.equal(lang.searchParams.get('utm_content'),'kol01');assert.equal(lang.hash,'#steps');
 await page.route('**/api/auth/cognito/start*',route=>route.fulfill({body:'OAuth fixture only'}));
 await page.getByRole('link',{name:'Google로 로그인'}).click();
 await page.waitForURL('**/api/auth/cognito/start*');
 const auth=new URL(page.url()),returnTo=new URL(auth.searchParams.get('returnTo'),'https://kyaa.io');
 assert.equal(auth.searchParams.get('provider'),'google');assert.equal(returnTo.searchParams.get('utm_content'),'kol01');assert(returnTo.searchParams.has('x_started'));assert.equal(returnTo.hash,'#steps');
 await page.goto(`http://localhost:4207/?locale=en&state=in&${campaign}&x_started=${encodeURIComponent(returnTo.searchParams.get('x_started'))}`);
 await page.waitForFunction(()=>window.fixtureEvents?.length>0);
 const event=await page.evaluate(()=>window.fixtureEvents[0]);
 assert.equal(event.source,'x_mission.identified');assert.equal(event.anonymousSessionId,null);assert.equal(event.properties.kol,'kol01');assert.equal(event.properties.campaign,'kol-1113');assert(event.properties.flowStartedAt);
 assert.equal(await page.locator('main').getAttribute('lang'),'en');
 await page.goto(`http://localhost:4207/?state=guest&ua=x-ios&browser=ko&${campaign}`);
 await page.getByRole('button',{name:'브라우저로 열기'}).click();
 await page.getByText('X 메뉴에서 ‘브라우저에서 열기’를 선택해 주세요.').waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('Follow-up UI passed: browser locale, explicit locale, UTM/hash language switch, Google returnTo/start, authenticated KoL event payload, iOS X manual fallback');
 await page.close();
} finally {await browser.close();}
