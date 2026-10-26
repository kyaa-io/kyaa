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
  const enter = page.getByRole("button", { name: "응모하기", exact: true });
  await expect(enter).toBeDisabled();
  assert.equal(await page.evaluate(async path => (await fetch(path, { method: "POST", headers: { authorization: "Bearer gggi-loopback-fan" } })).status, endpoint), 409);
  await page.getByRole("button", { name: "좋아요 남기기", exact: true }).click();
  await expect(enter).toBeEnabled();
  assert.equal((await read()).participation.enteredAt, null);
  await page.getByRole("link", { name: "이벤트", exact: true }).click();
  await expect(page.locator("#gggi-event-heading")).toHaveText("GGGI × 창하 굿즈 이벤트");
  await expect(page.getByText("지금 응모할 수 있는 선물이 없어요.", { exact: true })).toHaveCount(0);
  await expect(enter).toBeEnabled();
  await enter.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("응모가 완료됐어요", { exact: true })).toBeVisible();
  const enteredAt = (await read()).participation.enteredAt;
  const repeats = await page.evaluate(async path => Promise.all(Array.from({ length: 4 }, async () => (await fetch(path, { method: "POST", headers: { authorization: "Bearer gggi-loopback-fan" } })).json())), endpoint);
  assert(repeats.every(result => result.participation.enteredAt === enteredAt));
  await page.reload();
  await expect(page.getByText("응모가 완료됐어요", { exact: true })).toBeVisible();
  assert.equal((await read()).participation.enteredAt, enteredAt);
  console.log("PASS like is required, keyboard entry is explicit, duplicate submissions preserve one receipt, reload restores it");

  for (const committed of [false, true]) {
    await reset(true);
    await expect(enter).toBeEnabled();
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
    await enter.click();
    await expect(page.getByRole("alert")).toHaveText("응모 상태를 확인하지 못했어요. 다시 확인해 주세요.");
    await expect(page.getByText("응모가 완료됐어요", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "다시 확인", exact: true }).click();
    if (!committed) {
      await expect(enter).toBeEnabled();
      await enter.click();
    }
    await expect(page.getByText("응모가 완료됐어요", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.__gggiEventPosts), committed ? 1 : 2);
  }
  console.log("PASS failures before and after commit reconcile safely before retrying");

  await page.goto(`${base}/gggi?viewer=fan&eventState=closed`);
  await expect(page.getByText("응모가 완료됐어요", { exact: true })).toBeVisible();
  await reset();
  for (const [value, text] of [["draft", "응모를 준비하고 있어요."], ["closed", "응모가 마감됐어요."]]) {
    await page.goto(`${base}/gggi?viewer=fan&eventState=${value}`);
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(enter).toHaveCount(0);
    assert.equal(await page.evaluate(async path => (await fetch(path, { method: "POST", headers: { authorization: "Bearer gggi-loopback-fan" } })).status, endpoint), 409);
  }
  console.log("PASS draft/closed reject new entries while existing confirmations survive closing");
  assert.deepEqual(errors, []); assert.deepEqual(resources, []); assert.deepEqual(unhandled, []);
  console.log("PASS no browser exceptions, failed resources, or unhandled APIs");
} finally { await browser?.close(); await harness?.server.close(); }
