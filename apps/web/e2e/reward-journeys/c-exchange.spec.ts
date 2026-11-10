import { expect, test } from "@playwright/test";
import { count, scalar } from "./support/db";
import { assertLocalOnly, BASE_URL, POLICY_VERSION } from "./support/env";
import { Member, newKey } from "./support/member";

type Exchange = { pointsSpent: number; units: number; replayed: boolean; pointLedgerId: string; creditLedgerId: string };
const exchange = (member: Member, body: { requestKey: string; adSessionId: string; units?: number }) =>
  member.call<Exchange & { error?: { code: string } }>("POST", "/api/me/wallet/exchange", { policyVersion: POLICY_VERSION, target: "ticket", units: 1, ...body });

test.describe("@release-gate (c) 100 points become one ticket, atomically", () => {
  let member: Member;
  test.beforeEach(() => {
    assertLocalOnly();
    member = new Member("dev-fan-5");
    member.reset();
  });

  test("the debit and the ticket land together, and a replay changes nothing", async ({ browser }) => {
    member.seedPoints(250);
    const wallet = await member.call<{ points: number; tickets: number; pointCost: number; exchangesRemainingToday: number }>("GET", "/api/me/wallet");
    expect(wallet.body).toMatchObject({ points: 250, tickets: 0, pointCost: 100 });
    const remaining = wallet.body.exchangesRemainingToday;

    const adSessionId = await member.grantedAdSession();
    const requestKey = newKey();
    const done = await exchange(member, { requestKey, adSessionId });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ pointsSpent: 100, units: 1, replayed: false });
    expect(member.balances()).toEqual({ points: 150, tickets: 1 });
    // Both ledger rows exist and share the request key as their source.
    expect(count(`select count(*) from public.mobile_fan_economy_ledger where app_user_id = '${member.id}' and source_id = '${requestKey}' and amount = -100`)).toBe(1);
    expect(count(`select count(*) from public.fan_ticket_ledger where app_user_id = '${member.id}' and source_id = '${requestKey}' and amount = 1`)).toBe(1);

    const replay = await exchange(member, { requestKey, adSessionId });
    expect(replay.body).toMatchObject({ replayed: true, pointLedgerId: done.body.pointLedgerId, creditLedgerId: done.body.creditLedgerId });
    expect(member.balances()).toEqual({ points: 150, tickets: 1 });

    const after = await member.call<{ exchangesRemainingToday: number }>("GET", "/api/me/wallet");
    expect(after.body.exchangesRemainingToday).toBe(remaining - 1);

    // The wallet screen shows the same numbers after a fresh load.
    const context = await browser.newContext({ storageState: member.storageState, baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/my/wallet?locale=ko");
    await expect(page.locator("body")).toContainText(/포인트\s*150\s*P/, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/응모권\s*1\s*장/);
    await context.close();
  });

  test("concurrent exchanges on one ad session spend 100 points once", async () => {
    member.seedPoints(500);
    const adSessionId = await member.grantedAdSession();
    const sameKey = newKey();
    const results = await Promise.all([
      ...Array.from({ length: 4 }, () => exchange(member, { requestKey: sameKey, adSessionId })),
      ...Array.from({ length: 4 }, () => exchange(member, { requestKey: newKey(), adSessionId })),
    ]);
    const paid = results.filter((r) => r.status === 200 && !r.body.replayed);
    expect(paid).toHaveLength(1);
    expect(results.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
    expect(member.balances()).toEqual({ points: 400, tickets: 1 });
    expect(member.ticketLedgerRows()).toBe(1);
  });

  test("not enough points: refused whole, nothing spent, the ad session stays unused", async () => {
    member.seedPoints(150);
    const adSessionId = await member.grantedAdSession();
    const refused = await exchange(member, { requestKey: newKey(), adSessionId, units: 2 });
    expect(refused.status).toBe(409);
    expect(refused.body.error?.code).toBe("GROUP_WALLET_INSUFFICIENT_BALANCE");
    expect(member.balances()).toEqual({ points: 150, tickets: 0 });
    expect(member.ticketLedgerRows()).toBe(0);
    expect(scalar(`select consumed_at is null from public.group_wallet_ad_sessions where id = '${adSessionId}'`)).toBe("t");

    // Below one unit, a new ad session is not even issued.
    member.reset();
    member.seedPoints(50);
    const none = await member.call<{ error?: { code: string } }>("POST", "/api/me/wallet/ad-session", {});
    expect(none.status).toBe(409);
    expect(none.body.error?.code).toBe("GROUP_WALLET_INSUFFICIENT_BALANCE");
    expect(member.balances().points).toBe(50);
  });

  test("a used ad session cannot pay a second exchange", async () => {
    member.seedPoints(300);
    const adSessionId = await member.grantedAdSession();
    expect((await exchange(member, { requestKey: newKey(), adSessionId })).status).toBe(200);
    const second = await exchange(member, { requestKey: newKey(), adSessionId });
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe("GROUP_WALLET_AD_SESSION_INVALID");
    expect(member.balances()).toEqual({ points: 200, tickets: 1 });
    // The balance never went below zero at any step.
    expect(count(`select count(*) from public.mobile_fan_economy_ledger where app_user_id = '${member.id}' and resulting_balance < 0`)).toBe(0);
  });
});
