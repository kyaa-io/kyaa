import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_DIR, APP_PORT, BASE_URL } from "./env";
import { appUserIdByEmail, balances, count, exec, resetMember, scalar } from "./db";

export type ApiResult<T = Record<string, unknown>> = { status: number; body: T };

import { storedCredential, sessionToken } from "./session";

function readEmail(account: string): string {
  const accounts = JSON.parse(fs.readFileSync(path.join(ACCOUNT_DIR, "accounts.json"), "utf8")) as Record<string, { email: string }>;
  const email = accounts[account]?.email;
  if (!email) throw new Error(`REWARD_E2E_ACCOUNT_UNKNOWN: ${account}`);
  return email;
}

export const newKey = (): string => crypto.randomUUID();

/** A signed-in test member: the real Privy token goes to the real routes; the database is only read, seeded or reset around them. */
export class Member {
  readonly id: string;
  private readonly credential: ReturnType<typeof storedCredential>;
  constructor(readonly account: string, private readonly stateFile = path.join(ACCOUNT_DIR, `${account}.local${APP_PORT}.json`)) {
    this.credential = storedCredential(this.storageState);
    this.id = appUserIdByEmail(readEmail(account));
  }
  /** The storage state file of this login, for browser contexts. */
  get storageState(): string { return this.stateFile; }

  async call<T = Record<string, unknown>>(method: "GET" | "POST", url: string, body?: unknown): Promise<ApiResult<T>> {
    const response = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: { authorization: `Bearer ${this.credential.token ?? await sessionToken(BASE_URL, this.credential.cookie!)}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 200) }; }
    return { status: response.status, body: parsed as T };
  }

  /** Empty reward history; the passport stays. Returns the passport the member owns. */
  reset(): { passportId: string; creatorId: string; creatorSlug: string } {
    resetMember(this.id);
    const row = scalar(`select p.id || '|' || p.celebrity_id || '|' || c.slug from public.fan_passports p join public.celebrities c on c.id = p.celebrity_id where p.app_user_id = '${this.id}' order by p.issued_at limit 1`);
    const [passportId, creatorId, creatorSlug] = row.split("|");
    if (!passportId) throw new Error(`REWARD_E2E_PASSPORT_MISSING: ${this.account} owns no passport`);
    exec(`insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id) values ('${this.id}', '${creatorId}')
      on conflict (app_user_id) do update set favorite_celebrity_id = excluded.favorite_celebrity_id`);
    return { passportId, creatorId, creatorSlug };
  }

  /** A fixture balance through the wallet's own posting function (same path the app uses), not through the routes under test. */
  seedPoints(amount: number) { exec(`select public.group_wallet_post('${this.id}', 'fan_point', ${amount}, 'dukjil_action', gen_random_uuid())`); }

  /** A watched rewarded-ad session, via the real session routes. The minimum viewing time is a clock, so the session and its "shown" time are moved back instead of waiting. */
  async grantedAdSession(): Promise<string> {
    const issued = await this.call<{ sessionId: string }>("POST", "/api/me/wallet/ad-session", {});
    if (issued.status !== 200) throw new Error(`AD_SESSION_NOT_ISSUED ${issued.status} ${JSON.stringify(issued.body)}`);
    const sessionId = issued.body.sessionId;
    if ((await this.call("POST", "/api/me/wallet/ad-session/report", { sessionId, event: "shown" })).status !== 200) throw new Error("AD_SESSION_SHOWN_FAILED");
    exec(`update public.group_wallet_ad_sessions set issued_at = issued_at - interval '1 hour', shown_at = shown_at - interval '1 hour' where id = '${sessionId}'`);
    const granted = await this.call<{ status: string }>("POST", "/api/me/wallet/ad-session/report", { sessionId, event: "granted" });
    if (granted.body.status !== "granted") throw new Error(`AD_SESSION_NOT_GRANTED ${JSON.stringify(granted.body)}`);
    return sessionId;
  }

  /** A passport page heart's ad session through the real routes (shown → granted; the session time moves back instead of waiting out the minimum viewing time). */
  async grantedHeartAdSession(passportId: string, pageNo: number): Promise<string> {
    const issued = await this.call<{ sessionId: string }>("POST", `/api/me/passports/${passportId}/pages/${pageNo}/ad-session`, {});
    if (issued.status !== 200) throw new Error(`HEART_AD_SESSION_NOT_ISSUED ${issued.status} ${JSON.stringify(issued.body)}`);
    const sessionId = issued.body.sessionId;
    if ((await this.call("POST", "/api/me/passports/ad-session/report", { sessionId, event: "shown" })).status !== 200) throw new Error("HEART_AD_SESSION_SHOWN_FAILED");
    exec(`update public.passport_claim_ad_sessions set issued_at = issued_at - interval '1 hour', shown_at = shown_at - interval '1 hour' where id = '${sessionId}'`);
    const granted = await this.call<{ status: string }>("POST", "/api/me/passports/ad-session/report", { sessionId, event: "granted" });
    if (granted.body.status !== "granted") throw new Error(`HEART_AD_SESSION_NOT_GRANTED ${JSON.stringify(granted.body)}`);
    return sessionId;
  }

  balances() { return balances(this.id); }
  stampCount(kind?: string) { return count(`select count(*) from public.community_stamps where app_user_id = '${this.id}'${kind ? ` and kind = '${kind}'` : ""}`); }
  hearts() { return count(`select coalesce(sum(amount),0) from public.creator_heart_ledger where app_user_id = '${this.id}'`); }
  pointLedgerRows() { return count(`select count(*) from public.mobile_fan_economy_ledger where app_user_id = '${this.id}' and asset = 'fan_point'`); }
  ticketLedgerRows() { return count(`select count(*) from public.fan_ticket_ledger where app_user_id = '${this.id}'`); }
}
