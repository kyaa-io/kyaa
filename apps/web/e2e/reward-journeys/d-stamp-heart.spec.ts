import { expect, test } from "@playwright/test";
import { count, exec, scalar } from "./support/db";
import { assertLocalOnly } from "./support/env";
import { Member, newKey } from "./support/member";

// Page 1 of the mission book holds nine slots; the member earns slot 2 (attendance) through the route, the rest are issued through the database's own stamp function.
const SLOT_KINDS = ["quiz", "daily_checkin", "post", "comment", "share", "invite", "subscription", "steady_checkin", "proof"] as const;

test.describe("@release-gate (d) nine stamps on a page earn one heart", () => {
  let member: Member;
  let passportId: string;
  let creatorId: string;
  let creatorSlug: string;
  test.beforeEach(() => {
    assertLocalOnly();
    member = new Member("dev-fan-5");
    ({ passportId, creatorId, creatorSlug } = member.reset());
  });

  const issue = (kind: string) => exec(`select public.dukjil_issue_stamp('${member.id}', '${creatorId}', '${kind}', 'e2e:${kind}', (select version from public.dukjil_active_policy()))`);
  type Claim = { hearts?: number; replayed?: boolean; jjinfanConfirmed?: boolean; error?: { code: string } };
  const claim = (page: number, adSessionId: string | undefined, requestKey = newKey()) => member.call<Claim>("POST", `/api/me/passports/${passportId}/pages/${page}/claim`, adSessionId ? { requestKey, adSessionId } : { requestKey });
  const issueHeartSession = (page: number) => member.call<{ sessionId?: string; error?: { code: string } }>("POST", `/api/me/passports/${passportId}/pages/${page}/ad-session`, {});
  const filled = () => count(`select count(*) from public.passport_page_slots where passport_id = '${passportId}' and page_no = 1 and stamp_id is not null`);

  test("eight stamps do not claim; the ninth pays one heart only after a granted ad, once", async () => {
    // Slot 2 through the real attendance route.
    expect((await member.call("POST", `/api/me/attendance/${creatorSlug}`, { requestKey: newKey() })).status).toBe(200);
    for (const kind of SLOT_KINDS.filter((k) => k !== "daily_checkin" && k !== "proof")) issue(kind);
    expect(filled()).toBe(8);

    // No ad session is issued for a page that cannot be claimed, so no ad is shown for nothing.
    const early = await issueHeartSession(1);
    expect(early.status).toBe(409);
    expect(early.body.error?.code).toBe("PASSPORT_PAGE_NOT_COMPLETE");
    expect(member.hearts()).toBe(0);

    issue("proof");
    expect(filled()).toBe(9);
    // 감독 11:46: the claim route without an ad session is refused, and nothing is paid.
    const bare = await claim(1, undefined);
    expect(bare.status).toBe(400);
    expect(bare.body.error?.code).toBe("GROUP_WALLET_AD_SESSION_REQUIRED");
    // An ad shown but closed before the reward (no 'granted' report) pays nothing.
    const shownOnly = (await issueHeartSession(1)).body.sessionId!;
    expect((await member.call("POST", "/api/me/passports/ad-session/report", { sessionId: shownOnly, event: "shown" })).status).toBe(200);
    const closed = await claim(1, shownOnly);
    expect(closed.status).toBe(409);
    expect(closed.body.error?.code).toBe("GROUP_WALLET_AD_SESSION_INVALID");
    // Another member's or a ticket session is not this page's session.
    const ticketSession = await (async () => { member.seedPoints(100); return member.grantedAdSession(); })();
    expect((await claim(1, ticketSession)).status).toBe(409);
    expect(member.hearts()).toBe(0);
    expect(count(`select count(*) from public.passport_page_claims where passport_id = '${passportId}'`)).toBe(0);

    const adSessionId = await member.grantedHeartAdSession(passportId, 1);
    const requestKey = newKey();
    const first = await claim(1, adSessionId, requestKey);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ hearts: 1, replayed: false, jjinfanConfirmed: true });
    expect(member.hearts()).toBe(1);
    expect(count(`select count(*) from public.jjinfan_titles where app_user_id = '${member.id}' and revoked_at is null`)).toBe(1);

    expect(count(`select count(*) from public.passport_claim_ad_sessions where id = '${adSessionId}' and consumed_at is not null`)).toBe(1);

    // The session that paid the page replays (same key, new keys, a concurrent burst) and leaves one heart.
    const burst = await Promise.all([claim(1, adSessionId, requestKey), claim(1, adSessionId), claim(1, adSessionId), claim(1, adSessionId), claim(1, adSessionId)]);
    expect(burst.every((r) => r.status === 200 && r.body.replayed === true)).toBe(true);
    expect(member.hearts()).toBe(1);
    expect(count(`select count(*) from public.passport_page_claims where passport_id = '${passportId}'`)).toBe(1);
    // No new session for a page that already has its heart, and no replay without the paying session.
    expect((await issueHeartSession(1)).status).toBe(409);
    expect((await claim(1, undefined)).status).toBe(400);

    // Page 2 is not complete.
    const next = await issueHeartSession(2);
    expect(next.status).toBe(409);
    expect(member.hearts()).toBe(1);
  });

  test("a cheer without a favorite creator says so and leaves the wallet alone", async () => {
    exec(`update public.fan_profile_public_fields set favorite_celebrity_id = null where app_user_id = '${member.id}'`);
    const before = member.balances();
    const stamps = member.stampCount();
    const cheer = await member.call<{ error?: { code: string } }>("POST", "/api/me/dukjil/cheer");
    expect(cheer.status).toBe(409);
    expect(cheer.body.error?.code).toBe("favorite_required");
    expect(member.balances()).toEqual(before);
    expect(member.stampCount()).toBe(stamps);
    expect(scalar(`select count(*) from public.creator_heart_ledger where app_user_id = '${member.id}'`)).toBe("0");
  });
});
