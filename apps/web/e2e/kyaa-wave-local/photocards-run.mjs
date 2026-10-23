import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root=process.env.KYAA_WAVE_LOCAL_URL??"http://127.0.0.1:4199";
const output=path.resolve(process.env.KYAA_WAVE_OUTPUT??"test-results/photocard-claims");
await mkdir(output,{recursive:true});
const localeSource=await readFile(new URL("../../i18n/locales.ts",import.meta.url),"utf8");
const locales=JSON.parse(localeSource.match(/APP_LOCALES = (\[[^;]+?\]) as const/)[1]);
const browser=await chromium.launch(),checks=[],shots=[];
const stamp=Date.now();
try {
 for(const creator of ["wena","changha"]) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:"reduce"});const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const url=`${root}/${creator}?locale=ko&tab=events&scenario=photocard&auth=1&owner=${stamp}-${creator}-${width}`;
  await page.goto(url);const card=page.getByRole("article").filter({has:page.getByRole("heading",{name:"미공개 디지털 포토카드"})});
  await expect(card).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  const button=card.getByRole("button",{name:creator==="wena"?"포토카드 2장 받기":"랜덤 포토카드 3장 받기"});await expect(button).toBeVisible();
  if(creator==="wena"){
   await expect(button).toBeDisabled();await page.getByRole("radio",{name:"아야 (AYA)"}).focus();await page.keyboard.press("ArrowRight");
   await expect(page.getByRole("radio",{name:"도아 (DOA)"})).toBeChecked();await expect(page.getByRole("radio",{name:"도아 (DOA)"})).toBeFocused();
  }
  await card.screenshot({path:path.join(output,`${creator}-selection-${width}.png`)});shots.push(`${creator}-selection-${width}.png`);
  assert(await card.evaluate(e=>e.scrollWidth<=e.clientWidth));
  const audit=await new AxeBuilder({page}).include("article:has(button)").withTags(["wcag2a","wcag2aa"]).analyze();assert.deepEqual(audit.violations,[]);
  await button.click();const view=card.getByRole("button",{name:"포토카드 보기"});await expect(view).toBeVisible();await expect(view).toBeFocused();await view.click();
  const modal=page.getByRole("dialog");await expect(modal).toBeVisible();const imgs=modal.getByRole("img");await expect(imgs).toHaveCount(creator==="wena"?2:3);
  await expect.poll(()=>imgs.evaluateAll(nodes=>nodes.every(i=>i.complete&&i.naturalWidth===960&&i.naturalHeight===1440))).toBe(true);
  const ratios=await imgs.evaluateAll(nodes=>nodes.map(i=>{const r=i.getBoundingClientRect();return r.width/r.height;}));assert(ratios.every(r=>Math.abs(r-2/3)<.001));
  assert(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:path.join(output,`${creator}-received-${width}.png`)});shots.push(`${creator}-received-${width}.png`);
  const idsBefore=await page.evaluate(()=>performance.getEntriesByType("resource").map(r=>r.name).filter(n=>n.includes("/api/photocards/")));
  await page.keyboard.press("Escape");await expect(modal).not.toBeVisible();await expect(view).toBeFocused();await page.reload();
  await expect(page.getByRole("button",{name:"포토카드 보기"})).toBeVisible();await expect(page.getByRole("radio")).toHaveCount(0);await page.getByRole("button",{name:"포토카드 보기"}).click();
  await expect.poll(()=>page.getByRole("dialog").getByRole("img").evaluateAll(nodes=>nodes.every(i=>i.complete))).toBe(true);
  const idsAfter=await page.evaluate(()=>performance.getEntriesByType("resource").map(r=>r.name).filter(n=>n.includes("/api/photocards/")));
  assert.deepEqual(idsAfter.sort(),idsBefore.sort());assert.deepEqual(errors,[]);checks.push(`${creator}/${width}: claim, fixed asset IDs after reload, full 2:3 images, keyboard and axe pass`);await context.close();
 }
 for(const locale of locales) for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:"reduce"});const page=await context.newPage();
  await page.goto(`${root}/wena?locale=${locale}&tab=events&scenario=photocard&auth=1&owner=${stamp}-${locale}-${width}`);
  const member=page.getByRole("radio",{name:"아야 (AYA)"});await expect(member).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${locale}/${width} viewport overflow`);
  const field=page.locator("fieldset").filter({has:member});assert(await field.evaluate(e=>e.scrollWidth<=e.clientWidth),`${locale}/${width} fieldset overflow`);
  checks.push(`${locale}/${width}: member choices and localized copy fit`);await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 await page.goto(`${root}/wena?locale=ko&tab=events&scenario=photocard-error&auth=1&owner=${stamp}-error`);
 await expect(page.getByText("수령 결과를 확인하지 못했어요. 다시 확인해 주세요.")).toBeVisible();await page.getByRole("article").filter({has:page.getByText("수령 결과를 확인하지 못했어요. 다시 확인해 주세요.")}).getByRole("button",{name:"다시 확인",exact:true}).click();await expect(page.getByRole("radio",{name:"아야 (AYA)"})).toBeVisible();checks.push("Failed read recovers through explicit retry");
 await page.goto(`${root}/wena?locale=ko&tab=events&scenario=photocard-preparing&auth=1&owner=${stamp}-pending`);await expect(page.getByText("포토카드 준비 중")).toBeVisible();await expect(page.getByRole("radio")).toHaveCount(0);checks.push("Incomplete assets remain in preparation");await context.close();
 await writeFile(path.join(output,"browser-verification.json"),JSON.stringify({boundary:"Production fanpage and claim UI; synthetic loopback owner/API, real watermarked QA images. SQL/API logic verified separately; no production write.",checks,shots},null,2)+"\n");console.log(`${checks.length} browser checks passed`);
} finally {await browser.close();}
