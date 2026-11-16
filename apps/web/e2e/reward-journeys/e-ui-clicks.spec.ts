import { expect, test, type Page } from "@playwright/test";
import { count } from "./support/db";
import { assertLocalOnly, BASE_URL } from "./support/env";
import { Member } from "./support/member";

// Journeys started from the signed-in screen: a real click on the real button, the real request, the ledger, then a reload.
// The rewarded-ad step is isolated the way the server already allows: a session that was watched and not yet spent is handed back
// by POST /api/me/wallet/ad-session, so the screen goes straight to the exchange request. The exchange route and the ledger are real.

// The wallet card reads "포인트 100P 사용 · 보유 N P": N is the member's balance.
const balanceShown = (points: number) => new RegExp(`포인트\\s*100\\s*P\\s*사용\\s*보유\\s*${points}\\s*P`);

async function openBenefits(page: Page) {
  await page.goto("/benefits?locale=ko");
  await expect(page.locator("body")).toContainText(/포인트\s*\d+\s*(\/\s*100\s*)?P/, { timeout: 30_000 });
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
    await expect(page.locator("body")).toContainText(balanceShown(0));

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
    await expect(page.locator("body")).toContainText(balanceShown(points));

    await page.reload();
    await expect(page.locator("body")).toContainText(balanceShown(points), { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/스탬프\s*9개\s*사용\s*보유\s*1\s*\/\s*9/);
    expect(member.pointLedgerRows()).toBe(1);
    await context.close();
  });

  test("clicking 출석 on the 7th day shows the one server total (button, celebration, done badge, benefits) and never adds the bonus again", async ({ browser }) => {
    const { creatorSlug, creatorId } = member.reset();
    const catalog = await member.call<{ rules: Record<string, { points: number; streakBonus: number; streakEvery: number }> }>("GET", "/api/dukjil/catalog");
    const { points: base, streakBonus: bonus, streakEvery: every } = catalog.body.rules.checkin;
    const total = base + bonus;
    member.seedStreak(creatorId, every - 1, base);
    const context = await browser.newContext({ storageState: member.storageState, baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    // Every "+N P" the page ever prints while the test runs, so a briefly shown wrong number cannot slip past a later correct one.
    await context.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __seenPoints: string[] }).__seenPoints = seen;
      const scan = (text: string | null) => { for (const m of text?.matchAll(/\+\d[\d,]*\s?P/g) ?? []) seen.push(m[0].replace(/\s/g, "")); };
      new MutationObserver((records) => { for (const r of records) { scan(r.target.textContent); r.addedNodes.forEach((n) => scan(n.textContent)); } }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    const page = await context.newPage();
    await openBenefits(page);
    await expect(page.locator("body")).toContainText(balanceShown(0));

    await page.locator('[data-mission="checkin"]').click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    // Before the click the button already promises the day's total (base + bonus).
    const claim = sheet.getByRole("button", { name: /오늘 출석하고/ });
    await expect(claim).toContainText(`${total}P`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/me/attendance/${creatorSlug}`) && r.request().method() === "POST"),
      claim.click(),
    ]);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ points: total, bonusPoints: bonus, streak: every, replayed: false });

    // Ledger: one row of the total.
    expect(member.pointLedgerAmounts()).toEqual([total]);
    expect(member.balances().points).toBe(total);

    // Done badge in the sheet and the celebration toast: the same total.
    await expect(sheet.getByRole("status")).toContainText(`+${total}P`);
    await expect(page.locator("body")).toContainText(`+${total}P · 스탬프 1`, { timeout: 15_000 });
    const seen = await page.evaluate(() => (window as unknown as { __seenPoints: string[] }).__seenPoints);
    expect(seen).toContain(`+${total}P`);
    expect(seen).not.toContain(`+${total + bonus}P`);
    expect(seen).not.toContain(`+${total + base}P`);

    // The screen behind the sheet and a reload: the same total.
    await expect(page.locator("body")).toContainText(balanceShown(total));
    await page.reload();
    await expect(page.locator("body")).toContainText(balanceShown(total), { timeout: 30_000 });
    expect(member.pointLedgerAmounts()).toEqual([total]);
    await context.close();
  });

  test("clicking 교환 spends 100 points for one ticket, and a reload shows the same numbers", async ({ browser }) => {
    member.reset();
    member.seedPoints(150);
    await member.grantedAdSession();
    const context = await browser.newContext({ storageState: member.storageState, baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await openBenefits(page);
    await expect(page.locator("body")).toContainText(balanceShown(150));

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
    await expect(page.locator("body")).toContainText(balanceShown(50), { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/응모권\s*1\s*장\s*획득\s*보유\s*1\s*장/);
    expect(member.balances()).toEqual({ points: 50, tickets: 1 });
    await context.close();
  });
});
