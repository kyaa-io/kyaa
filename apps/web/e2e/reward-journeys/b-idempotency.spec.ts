import { expect, test } from "@playwright/test";
import { scalar } from "./support/db";
import { assertLocalOnly, BASE_URL } from "./support/env";
import { Member, newKey } from "./support/member";

type Attend = { points: number; replayed: boolean };
type Cheer = { earned: number; replayed: boolean };

test.describe("@release-gate (b) one action never pays twice", () => {
  let member: Member;
  let creatorSlug: string;
  test.beforeEach(() => {
    assertLocalOnly();
    member = new Member("dev-fan-5");
    ({ creatorSlug } = member.reset());
  });

  test("the same request key, sent again, replays the first answer", async () => {
    const requestKey = newKey();
    const first = await member.call<Attend>("POST", `/api/me/attendance/${creatorSlug}`, { requestKey });
    const again = await member.call<Attend>("POST", `/api/me/attendance/${creatorSlug}`, { requestKey });
    expect([first.status, again.status]).toEqual([200, 200]);
    expect(first.body.replayed).toBe(false);
    expect(again.body).toMatchObject({ points: first.body.points, replayed: true });
    expect(member.balances().points).toBe(first.body.points);
    expect(member.pointLedgerRows()).toBe(1);
    expect(member.stampCount("daily_checkin")).toBe(1);
  });

  test("concurrent requests, same key or different keys, pay once", async () => {
    const sameKey = newKey();
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => member.call<Attend>("POST", `/api/me/attendance/${creatorSlug}`, { requestKey: sameKey })),
      ...Array.from({ length: 5 }, () => member.call<Attend>("POST", `/api/me/attendance/${creatorSlug}`, { requestKey: newKey() })),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => !r.body.replayed)).toHaveLength(1);
    const paid = results.find((r) => !r.body.replayed)!.body.points;
    expect(member.balances().points).toBe(paid);
    expect(member.pointLedgerRows()).toBe(1);
    expect(member.stampCount("daily_checkin")).toBe(1);
  });

  test("concurrent cheers on one day stamp once", async () => {
    // The one-per-day cheer key belongs to the B3 policy. Under the older policy a second tap is refused as SOURCE_REUSED (409) instead of replaying.
    const dayKeyed = scalar("select coalesce(rules #>> '{actions,cheer,sourceMode}', '') from public.dukjil_active_policy()") === "user_day";
    test.skip(!dayKeyed, "active dukjil policy has no cheer sourceMode=user_day (B3 policy not active in this database)");
    const results = await Promise.all(Array.from({ length: 6 }, () => member.call<Cheer>("POST", "/api/me/dukjil/cheer")));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(results.filter((r) => !r.body.replayed)).toHaveLength(1);
    expect(member.stampCount("cheer")).toBe(1);
  });

  test("a response lost in the browser, then retried, does not pay again", async ({ browser }) => {
    const context = await browser.newContext({ storageState: member.storageState, baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/api/health/live");
    const requestKey = newKey();
    const url = `/api/me/attendance/${creatorSlug}`;
    // The server processes the request; the answer never reaches the page.
    await page.route(`**${url}`, async (route) => { await route.fetch(); await route.abort("connectionreset"); });
    const lost = await page.evaluate(async ({ url, requestKey }) => {
      const token = JSON.parse(localStorage.getItem("privy:token") ?? "null");
      try { await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ requestKey }) }); return "answered"; } catch { return "lost"; }
    }, { url, requestKey });
    expect(lost).toBe("lost");
    const paidOnce = member.balances().points;
    expect(paidOnce).toBeGreaterThan(0);
    await page.unroute(`**${url}`);
    const retry = await page.evaluate(async ({ url, requestKey }) => {
      const token = JSON.parse(localStorage.getItem("privy:token") ?? "null");
      const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ requestKey }) });
      return { status: r.status, body: await r.json() };
    }, { url, requestKey });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ points: paidOnce, replayed: true });
    expect(member.balances().points).toBe(paidOnce);
    expect(member.pointLedgerRows()).toBe(1);
    await context.close();
  });
});

// Run only with a local email browser storage state and a disposable local database.
test("cookie-only email login: lost attendance response retries with no duplicate credit", async ({ browser }) => {
  assertLocalOnly();
  const state = process.env.REWARD_E2E_EMAIL_STORAGE_STATE;
  test.skip(!state, "REWARD_E2E_EMAIL_STORAGE_STATE is required");
  const emailMember = new Member(process.env.REWARD_E2E_EMAIL_ACCOUNT ?? "dev-fan-5", state!);
  const { creatorSlug } = emailMember.reset();
  const context = await browser.newContext({ storageState: state, baseURL: BASE_URL });
  try {
    const page = await context.newPage();
    await page.goto("/api/health/live");
    const session = await page.evaluate(async () => {
      const response = await fetch("/api/auth/cognito/session");
      return { status: response.status, body: await response.json(), privy: localStorage.getItem("privy:token") };
    });
    expect(session).toMatchObject({ status: 200, body: { authenticated: true, accessToken: expect.stringMatching(/^kyaa-email:/) }, privy: null });
    const requestKey = newKey(), url = `/api/me/attendance/${creatorSlug}`;
    await page.route(`**${url}`, async (route) => { await route.fetch(); await route.abort("connectionreset"); });
    const lost = await page.evaluate(async ({ url, requestKey, token }) => {
      try { await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ requestKey }) }); return false; } catch { return true; }
    }, { url, requestKey, token: session.body.accessToken });
    expect(lost).toBe(true);
    const paid = emailMember.balances().points;
    expect(paid).toBeGreaterThan(0);
    await page.unroute(`**${url}`);
    const retried = await emailMember.call<Attend>("POST", url, { requestKey });
    expect(retried).toMatchObject({ status: 200, body: { points: paid, replayed: true } });
    expect(emailMember.balances().points).toBe(paid);
    expect(emailMember.pointLedgerRows()).toBe(1);
    expect(emailMember.stampCount("daily_checkin")).toBe(1);
  } finally { await context.close(); }
});
