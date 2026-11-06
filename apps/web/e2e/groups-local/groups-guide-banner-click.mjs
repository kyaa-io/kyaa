// Clicks each guide banner in the synthetic groups harness and records the URL it navigates to (the harness itself renders /guide as the groups finder).
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const base=process.env.GROUPS_GUIDE_BANNER_BASE??'http://127.0.0.1:3701',browser=await chromium.launch(),rows=[];
try{for(const [locale,label,slug] of [['en','How to become a true fan','jjinfan'],['ja','How to earn as a fan','dukjil'],['ko','덕질하는 법','dukjil']]){
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.routeWebSocket('**',s=>s.close());
 await page.goto(`${base}/pages/groups?locale=${locale}`);await page.getByRole('link',{name:new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();
 await page.waitForURL(/\/guide\//);const url=new URL(page.url());rows.push({locale,path:url.pathname,locale_param:url.searchParams.get('locale')});
 assert.equal(url.pathname,`/guide/${slug}`);assert.equal(url.searchParams.get('locale'),locale);await page.close();}
 console.log(JSON.stringify(rows));}finally{await browser.close();}
