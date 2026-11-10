import { expect, test, type Page } from "@playwright/test";
import { count } from "./support/db";
import { assertLocalOnly, BASE_URL } from "./support/env";
import { Member } from "./support/member";

// Journeys started from the signed-in screen: a real click on the real button, the real request, the ledger, then a reload.
// The rewarded-ad step is isolated the way the server already allows: a session that was watched and not yet spent is handed back
// by POST /api/me/wallet/ad-session, so the screen goes straight to the exchange request. The exchange route and the ledger are real.

async function openBenefits(page: Page) {
  await page.goto("/benefits?locale=ko");
  await expect(page.locator("body")).toContainText(/포인트\s*\d+\s*P/, { timeout: 30_000 });
}

test.describe("@release-gate (e) screen clicks", () => {
  let member: Member;
  test.beforeEach(() => { assertLocalOnly(); member = new Member("dev-fan-5"); });

  test("clicking 출석 pays points and a stamp once, and a reload shows the same numbers", async ({ browser }) => {
    const { creatorSlug } = member.reset();
    const catalog = await member.call<{ rules: Record<string, { points: number }> }>("GET", "/api/dukjil/catalog");
    const points = catalog.body.rules.checkin.points;
    const context = await browser.newContext({ storageState: member.storageState, baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await openBenefits(page);
    await expect(page.locator("body")).toContainText(/포인트\s*0\s*P/);

    // The 출석 row opens the check-in sheet; its button sends the request.
    await page.locator('[data-mission="checkin"]').click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/me/attendance/${creatorSlug}`) && r.request().method() === "POST"),
      sheet.getByRole("button", { name: /오늘 출석하고/ }).click(),
    ]);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ points, streak: 1, replayed: false });

    // Ledger and stamp, read from the database, not from the screen.
    expect(member.balances().points).toBe(points);
    expect(member.pointLedgerRows()).toBe(1);
    expect(member.stampCount("daily_checkin")).toBe(1);
    await expect(page.locator("body")).toContainText(new RegExp(`포인트\\s*${points}\\s*P`));

    await page.reload();
    await expect(page.locator("body")).toContainText(new RegExp(`포인트\\s*${points}\\s*P`), { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/스탬프\s*1\s*\/\s*9/);
    expect(member.pointLedgerRows()).toBe(1);
    await context.close();
  });

  test("clicking 교환 spends 100 points for one ticket, and a reload shows the same numbers", async ({ browser }) => {
    member.reset();
    member.seedPoints(150);
    await member.grantedAdSession();
    const context = await browser.newContext({ storageState: member.storageState, baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await openBenefits(page);
    await expect(page.locator("body")).toContainText(/포인트\s*150\s*P/);

    await page.getByRole("button", { name: /교환/ }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/me/wallet/exchange") && r.request().method() === "POST"),
      sheet.locator("button").last().click(),
    ]);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ units: 1, pointsSpent: 100, replayed: false });

    expect(member.balances()).toEqual({ points: 50, tickets: 1 });
    expect(member.ticketLedgerRows()).toBe(1);
    expect(count(`select count(*) from public.mobile_fan_economy_ledger where app_user_id = '${member.id}' and amount = -100`)).toBe(1);

    await page.reload();
    await expect(page.locator("body")).toContainText(/포인트\s*50\s*P/, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/응모권\s*1\s*장/);
    expect(member.balances()).toEqual({ points: 50, tickets: 1 });
    await context.close();
  });
});
