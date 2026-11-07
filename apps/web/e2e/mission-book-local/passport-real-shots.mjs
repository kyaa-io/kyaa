// Read-only captures of the passport detail in the real app on another port. Writes are stubbed. Args: output directory, storage state (optional).
import { chromium } from "@playwright/test";
const [out, storage, target = "127.0.0.1:3610"] = process.argv.slice(2);
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP localhost:3000 ${target}`] });
const label = storage ? "login" : "guest";
for (const width of [390, 768, 1024, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, ...(storage ? { storageState: storage } : {}) });
  await context.route("http://localhost:3000/**", route => { const r = route.request(); return ["GET", "HEAD"].includes(r.method()) || new URL(r.url()).pathname.startsWith("/_next/") ? route.fallback() : route.fulfill({ status: 204, body: "" }); });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/passports?locale=ko", { waitUntil: "domcontentloaded", timeout: 170000 });
  const first = page.locator('a[href^="/passports/"]').first();
  await first.waitFor({ timeout: storage ? 60000 : 5000 }).catch(() => {});
  const id = await first.getAttribute("href", { timeout: 3000 }).then(href => href?.split("/")[2]?.split(/[?#]/)[0]).catch(() => null);
  await page.goto(`http://localhost:3000/passports/${id ?? "46ef95ab-e780-4afc-8b0b-537eb35e7c49"}?locale=ko`, { waitUntil: "domcontentloaded", timeout: 170000 });
  await page.waitForSelector(storage ? "[data-passport-book] ol li" : "article", { timeout: 60000 }).catch(() => console.log(label, width, "no content"));
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(() => {
    const book = document.querySelector("[data-passport-book]"), mission = document.querySelector("#mission-book"), slots = [...document.querySelectorAll("#mission-book ol li")];
    const rect = el => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    const lines = el => el ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) : null;
    return { scroll: document.documentElement.scrollWidth, inner: innerWidth, bookClient: book?.clientWidth, bookScroll: book?.scrollWidth, missionTop: rect(mission), firstSlotTop: rect(slots[0]), slots: slots.length, slotRight: slots.length ? Math.round(Math.max(...slots.map(s => s.getBoundingClientRect().right))) : null, nameLines: lines(document.querySelector('[data-passport-field="fan-name"]')), dateLines: lines(document.querySelector('[data-passport-field="issue-date"]')), starLines: lines(document.querySelector('[data-passport-field="star"] a span')), pageTurn: document.querySelectorAll("#mission-book nav button").length, claim: [...document.querySelectorAll("#mission-book button, #mission-book a")].map(el => el.textContent.trim()).filter(Boolean).slice(-1)[0] };
  });
  console.log(label, width, JSON.stringify(metrics));
  await page.screenshot({ path: `${out}/${label}-${width}-fold.png` });
  await page.screenshot({ path: `${out}/${label}-${width}-full.png`, fullPage: true });
  await context.close();
}
await browser.close();
