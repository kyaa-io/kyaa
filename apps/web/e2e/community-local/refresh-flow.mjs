import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { startHarness } from "../lounge-local/server.mjs";

// Runs real handlers + disposable PostgreSQL. No page.reload()/goto between steps except the explicit deep-link step.
const out = process.env.REFRESH_FLOW_OUT || path.resolve("apps/web/test-results/community-refresh");
await mkdir(out, { recursive: true });
const harness = await startHarness({ fanWebMode: true });
const rows = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem("lounge-test-identity-set")) localStorage.setItem("lounge-test-identity", "fan"); });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  let reqs = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) reqs.push(`${r.method()} ${u.pathname}`); });
  page.on("response", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && r.status() >= 400) r.text().then(t => console.log("HTTP", r.status(), r.request().method(), u.pathname, t.slice(0, 200))); });
  page.route("**/api/celebrities/*/attachment-policy", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photoLimit: 4, videoAllowed: false }) }));
  page.route("**/api/celebrities/*/certifications?*", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ certifications: [] }) }));
  const step = async (name, fn) => {
    reqs = [];
    let verdict = "PASS", note = "";
    try { await fn(); } catch (e) { verdict = "DEFECT?"; note = String(e.message).split("\n")[0]; }
    await page.waitForTimeout(400);
    const noReload = await page.evaluate(() => window.__marker === 1).catch(() => false);
    await page.evaluate(() => { window.__marker = 1; }).catch(() => {});
    rows.push({ name, verdict, note, requests: reqs.length, list: [...reqs], noReload });
    console.log(`${verdict} ${name} requests=${reqs.length} noReload=${noReload} ${note}`);
  };

  const hub = "/community?creator=elina&tab=posts&locale=ko";
  await page.goto(harness.baseURL + hub);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "debug-initial.png") });
  console.log("BODY", (await page.locator("body").innerText()).slice(0, 400), "ERR", JSON.stringify(errors));
  await expect(page.getByText("오늘은 어떤 이야기를 나눌까요?")).toBeVisible();
  await page.evaluate(() => { window.__marker = 1; });
  const body1 = `새로고침 없는 작성 ${Date.now()}`;
  const body2 = `${body1} (수정됨)`;
  let postId;

  await step("글 작성 → 목록 반영", async () => {
    await page.getByText("오늘은 어떤 이야기를 나눌까요?").click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, "debug-composer.png") });
    console.log("ROLES", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("textarea,input,button")].filter(e => e.offsetParent).map(e => `${e.tagName}:${e.getAttribute("aria-label") || e.textContent?.trim().slice(0,20) || e.name}`))));
    await page.getByRole("textbox", { name: "글 쓰기" }).fill(body1);
    const saved = page.waitForResponse(r => new URL(r.url()).pathname === "/api/celebrities/elina/posts" && r.request().method() === "POST");
    await page.getByRole("button", { name: "게시" }).click();
    postId = (await (await saved).json()).id;
    await expect(page.locator(`[data-post-id="${postId}"]`).getByText(body1, { exact: true })).toBeVisible();
  });
  await page.screenshot({ path: path.join(out, "390-list-after-create.png"), fullPage: false });

  await step("좋아요 → 수치 반영", async () => {
    const like = page.locator(`[data-post-id="${postId}"]`).locator("button[aria-pressed]").first();
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(like).toContainText("1");
  });
  await step("좋아요 취소 → 수치 반영", async () => {
    const like = page.locator(`[data-post-id="${postId}"]`).locator("button[aria-pressed]").first();
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await expect(like).not.toContainText("1");
  });

  await step("목록 → 상세 이동(클라이언트 이동)", async () => {
    await page.locator(`[data-post-id="${postId}"]`).getByRole("link", { name: /댓글/ }).click();
    await expect(page).toHaveURL(u => u.pathname === `/c/elina/community/${postId}`);
    await expect(page.getByText(body1, { exact: true })).toBeVisible();
  });

  const comment = `새로고침 없는 댓글 ${Date.now()}`;
  await step("댓글 작성 → 상세 수치·목록 반영", async () => {
    await page.getByRole("textbox", { name: "댓글 쓰기" }).fill(comment);
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page.locator("li").getByText(comment, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /댓글\s*1/ })).toBeVisible();
  });

  await step("상세에서 수정 → 상세 반영", async () => {
    await page.getByRole("button", { name: "더 보기" }).first().click();
    await page.getByRole("menuitem", { name: "수정" }).click();
    const box = page.getByRole("textbox").first();
    await box.fill(body2);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText(body2, { exact: true })).toBeVisible();
  });
  await page.screenshot({ path: path.join(out, "390-detail-after-edit.png"), fullPage: true });

  await step("댓글 삭제 → 수치·목록 반영", async () => {
    const li = page.locator("li", { hasText: comment });
    await li.getByRole("button", { name: "삭제" }).click();
    const dlg = page.getByRole("dialog");
    if (await dlg.count()) await dlg.getByRole("button", { name: "삭제" }).click();
    await expect(page.locator("li").getByText(comment, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /댓글\s*0/ })).toBeVisible();
  });

  await step("상세 → 목록 복귀 → 수정 내용·댓글 0 반영", async () => {
    await page.getByRole("link", { name: "돌아가기" }).first().click();
    const card = page.locator(`[data-post-id="${postId}"]`);
    await expect(card.getByText(body2, { exact: true })).toBeVisible();
    await expect(card.getByText(body1, { exact: true })).toHaveCount(0);
  });

  await step("목록에서 삭제 → 목록에서 사라짐", async () => {
    const card = page.locator(`[data-post-id="${postId}"]`);
    await card.getByRole("button", { name: "더 보기" }).click();
    await page.getByRole("menuitem", { name: "삭제" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
    await expect(page.locator(`[data-post-id="${postId}"]`)).toHaveCount(0);
  });

  // Deep link: separate navigation by definition.
  const other = await (await fetch(harness.baseURL + "/api/celebrities/elina/posts", {
    method: "POST",
    headers: { authorization: "Bearer lounge-local-fan", "content-type": "application/json" },
    body: JSON.stringify({ body: `딥링크 확인 ${Date.now()}`, visibility: "public", assetIds: [], idempotencyKey: crypto.randomUUID() }),
  })).json();
  await step("상세 딥링크 직접 열기", async () => {
    await page.goto(`${harness.baseURL}/c/elina/community/${other.id}?locale=ko&returnTo=${encodeURIComponent(hub)}`);
    await expect(page.getByText(/딥링크 확인/)).toBeVisible();
  });
  rows[rows.length - 1].noReload = "n/a (직접 이동)";

  await ctx.close();
  const d = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await d.addInitScript(() => localStorage.setItem("lounge-test-identity", "fan"));
  const dp = await d.newPage();
  await dp.route("**/api/celebrities/*/attachment-policy", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ photoLimit: 4, videoAllowed: false }) }));
  await dp.route("**/api/celebrities/*/certifications?*", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ certifications: [] }) }));
  await dp.goto(harness.baseURL + hub);
  await expect(dp.locator(`[data-post-id="${other.id}"]`)).toBeVisible();
  await dp.screenshot({ path: path.join(out, "1440-list.png"), fullPage: true });
  await dp.goto(`${harness.baseURL}/c/elina/community/${other.id}?locale=ko&returnTo=${encodeURIComponent(hub)}`);
  await expect(dp.getByText(/딥링크 확인/)).toBeVisible();
  await dp.screenshot({ path: path.join(out, "1440-detail.png"), fullPage: true });
  console.log("pageerrors", JSON.stringify(errors));
  rows.push({ name: "pageerror", verdict: errors.length ? "DEFECT?" : "PASS", note: errors.join(" | "), requests: 0, list: [] });
} finally {
  await writeFile(path.join(out, "refresh-flow.json"), JSON.stringify(rows, null, 2));
  await browser?.close();
  await harness.vite.close();
}
