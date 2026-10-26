import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { startHarness } from "./server.mjs";

const harness = process.env.GGGI_LOCAL_BASE_URL ? null : await startHarness(4227);
const base = process.env.GGGI_LOCAL_BASE_URL ?? harness.baseURL;
assert.equal(new URL(base).hostname, "127.0.0.1");
let browser;
const endpoint = "/api/celebrities/gggi/event-entry";
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], resources = [], unhandled = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) resources.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("console", message => { if (message.text().includes("GGGI_LOCAL_UNHANDLED_API")) unhandled.push(message.text()); });
  const read = () => page.evaluate(async path => (await fetch(path, { headers: { authorization: "Bearer gggi-loopback-fan" } })).json(), endpoint);
  async function reset(like = false) {
    await page.goto(`${base}/gggi?viewer=fan`);
    await page.evaluate(async shouldLike => {
      localStorage.setItem("gggi-event-dismissed-day", new Date().toLocaleDateString("en-CA"));
      const headers = { authorization: "Bearer gggi-loopback-fan" };
      await fetch("/api/local/gggi/reset", { method: "POST", headers });
      if (shouldLike) await fetch("/api/celebrities/gggi/reactions", { method: "POST", headers });
    }, like);
    await page.reload();
  }

  await page.goto(`${base}/gggi?viewer=guest`);
  const login = await page.getByRole("link", { name: "로그인하고 응모하기", exact: true });
  await expect(login).toBeVisible();
  assert.equal(await page.evaluate(async path => (await fetch(path, { method: "POST" })).status, endpoint), 401);
  const guest = await page.evaluate(async path => (await fetch(path)).json(), endpoint);
  assert.equal(guest.participation, null);
  await login.click();
  await page.getByRole("link", { name: "로컬 참여자로 계속" }).click();
  await expect(page).toHaveURL(/\/gggi\?.*viewer=fan#gggi-event$/);
  console.log("PASS login returns to the event without automatic entry; guests cannot submit or read ownership");

  await reset();
  const confirmation = page.locator("#gggi-event [role=status]");
  await expect(page.getByRole("link", { name: "좋아요로 자동 응모하기", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(async path => (await fetch(path, { method: "POST", headers: { authorization: "Bearer gggi-loopback-fan" } })).status, endpoint), 409);
  await page.getByRole("button", { name: "좋아요 남기기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "응모가 완료됐어요", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveText("응모가 완료됐어요");
  await page.getByRole("link", { name: "이벤트", exact: true }).click();
  await expect(page.locator("#gggi-event-heading")).toHaveText("GGGI × 창하 굿즈 이벤트");
  await expect(page.getByText("지금 응모할 수 있는 선물이 없어요.", { exact: true })).toHaveCount(0);
  await expect(confirmation).toHaveText("응모가 완료됐어요");
  const enteredAt = (await read()).participation.enteredAt;
  const repeats = await page.evaluate(async path => Promise.all(Array.from({ length: 4 }, async () => (await fetch(path, { method: "POST", headers: { authorization: "Bearer gggi-loopback-fan" } })).json())), endpoint);
  assert(repeats.every(result => result.participation.enteredAt === enteredAt));
  await page.reload();
  await expect(confirmation).toHaveText("응모가 완료됐어요");
  assert.equal((await read()).participation.enteredAt, enteredAt);
  console.log("PASS a like automatically enters, completion modal closes with Escape, duplicate submissions and reload preserve one receipt");

  for (const committed of [false, true]) {
    await reset();
    await expect(page.getByRole("button", { name: "좋아요 남기기", exact: true })).toBeVisible();
    await page.evaluate(({ path, committed }) => {
      const original = window.fetch;
      let fail = true;
      window.__gggiEventPosts = 0;
      window.fetch = async (input, init) => {
        if (String(input) === path && init?.method === "POST") {
          window.__gggiEventPosts++;
          if (fail) {
            fail = false;
            if (committed) await original(input, init);
            throw new TypeError("Simulated lost response");
          }
        }
        return original(input, init);
      };
    }, { path: endpoint, committed });
    await page.getByRole("button", { name: "좋아요 남기기", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("응모 상태를 확인하지 못했어요. 다시 확인해 주세요.");
    await expect(page.getByText("응모가 완료됐어요", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "다시 확인", exact: true }).click();

    await expect(confirmation).toHaveText("응모가 완료됐어요");
    assert.equal(await page.evaluate(() => window.__gggiEventPosts), committed ? 1 : 2);
  }
  console.log("PASS failures before and after commit reconcile safely before retrying");

  await page.goto(`${base}/gggi?viewer=fan&eventState=closed`);
  await expect(confirmation).toHaveText("응모가 완료됐어요");
  await reset();
  for (const [value, text] of [["draft", "응모를 준비하고 있어요."], ["closed", "응모가 마감됐어요."]]) {
    await page.goto(`${base}/gggi?viewer=fan&eventState=${value}`);
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "좋아요로 자동 응모하기", exact: true })).toHaveCount(0);
    assert.equal(await page.evaluate(async path => (await fetch(path, { method: "POST", headers: { authorization: "Bearer gggi-loopback-fan" } })).status, endpoint), 409);
  }
  console.log("PASS draft/closed reject new entries while existing confirmations survive closing");
  assert.deepEqual(errors, []); assert.deepEqual(resources, []); assert.deepEqual(unhandled, []);
  console.log("PASS no browser exceptions, failed resources, or unhandled APIs");
} finally { await browser?.close(); await harness?.server.close(); }
