import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGroupWalletHandlers, type GroupWalletDependencies } from "./routes";
const owner = "11111111-1111-4111-8111-111111111111", key = "22222222-2222-4222-8222-222222222222", session = "33333333-3333-4333-8333-333333333333";
const openDecision = { enabled: true, adUnit: "/1/test_unit", session: { ttlSeconds: 11, minWatchSeconds: 3, issueLimit: 5, issueWindowSeconds: 13, dailyCap: 7 } } as const; // test-only values
const deps: GroupWalletDependencies = { authorize: vi.fn(async () => ({ appUserId: owner })), rpc: vi.fn() };
const api = createGroupWalletHandlers(deps);
const request = (path: string, body?: unknown) => new Request(`https://fixture.test${path}`, { method: body ? "POST" : "GET", headers: { authorization: "Bearer fixture" }, body: body ? JSON.stringify(body) : undefined });
beforeEach(() => vi.clearAllMocks());
describe("global web wallet trust boundary", () => {
  it("reads actual global balances with server-owned identity and no creator", async () => {
    const wallet = { sequence: 1, points: 100, tickets: 3, policyVersion: "group-wallet-v1", pointCost: 100, writeFenced: false, attendance: { date: "2026-11-01", checkedIn: false, streak: 6, nextBonusIn: 1, days: [] } };
    vi.mocked(deps.rpc).mockResolvedValue(wallet);
    const response = await api.wallet(request("/wallet"));
    expect(await response.json()).toEqual(wallet);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_group_wallet", { p_app_user_id: owner });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  describe("exchangesRemainingToday", () => {
    const wallet = { sequence: 1, points: 100, tickets: 3, policyVersion: "group-wallet-v1", pointCost: 100, writeFenced: false, attendance: { date: "2026-11-01", checkedIn: false, streak: 6, nextBonusIn: 1, days: [] } };
    const reply = (left: unknown) => vi.mocked(deps.rpc).mockImplementation(async (name: string) => (name === "read_owned_group_wallet" ? wallet : left));
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    it("adds the server-computed remaining count for the signed-in owner only, with the server cap", async () => {
      reply({ exchangesRemainingToday: 4 });
      expect(await (await open.wallet(request("/wallet"))).json()).toEqual({ ...wallet, exchangesRemainingToday: 4 });
      expect(deps.rpc).toHaveBeenCalledWith("read_owned_group_wallet_exchanges_remaining", { p_app_user_id: owner, p_daily_cap: 7 });
    });
    it("shows 0 at the cap", async () => {
      reply({ exchangesRemainingToday: 0 });
      expect((await (await open.wallet(request("/wallet"))).json()).exchangesRemainingToday).toBe(0);
    });
    it("omits the field when the ad settings are closed or missing, without calling the function", async () => {
      reply({ exchangesRemainingToday: 4 });
      for (const decision of [undefined, { enabled: false, reason: "gate_closed" } as const, { enabled: false, reason: "config_missing" } as const]) {
        vi.mocked(deps.rpc).mockClear();
        expect(await (await createGroupWalletHandlers({ ...deps, rewardedExchange: decision }).wallet(request("/wallet"))).json()).toEqual(wallet);
        expect(deps.rpc).toHaveBeenCalledTimes(1);
      }
    });
    it("keeps the balances and omits the field when the function is missing or returns a bad value", async () => {
      for (const bad of [{ exchangesRemainingToday: -1 }, { exchangesRemainingToday: 1, other: 1 }, null]) { reply(bad); expect(await (await open.wallet(request("/wallet"))).json()).toEqual(wallet); }
      vi.mocked(deps.rpc).mockImplementation(async (name: string) => { if (name === "read_owned_group_wallet") return wallet; throw new Error("function does not exist"); });
      expect(await (await open.wallet(request("/wallet"))).json()).toEqual(wallet);
    });
  });
  it("does not turn an unavailable or malformed wallet into zero balances", async () => {
    for (const result of [{ points: 0 }, { points: -1 }, null]) { vi.mocked(deps.rpc).mockResolvedValue(result); expect((await api.wallet(request("/wallet"))).status).toBe(503); }
  });
  it("rejects owner injection, noninteger quantities and client-selected price", async () => {
    const input = { requestKey: key, policyVersion: "group-wallet-v1", target: "ticket", units: 1 };
    for (const body of [{ ...input, appUserId: owner }, { ...input, units: 1.5 }, { ...input, units: 0 }, { ...input, pointCost: 1 }]) expect((await api.exchange(request("/exchange", body))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  const ticket = { requestKey: key, policyVersion: "group-wallet-v1", target: "ticket", units: 1, adSessionId: session };
  const receipt = { requestKey: key, target: "ticket", units: 1, pointsSpent: 100, pointLedgerId: key, creditLedgerId: key, policyVersion: "group-wallet-v1", createdAt: "2026-11-01T00:00:00Z", replayed: false };
  it("rejects every ad-session route while the decision is closed and never touches the wallet", async () => {
    const closed = [undefined, { enabled: false, reason: "gate_closed" }, { enabled: false, reason: "config_missing" }] as const;
    for (const decision of closed) {
      const gated = createGroupWalletHandlers({ ...deps, rewardedExchange: decision });
      const expected = decision?.reason === "config_missing" ? [503, "GROUP_WALLET_AD_CONFIG_MISSING"] : [403, "GROUP_WALLET_AD_GATE_CLOSED"];
      for (const response of [await gated.exchange(request("/exchange", ticket)), await gated.adSession(request("/ad-session", {})), await gated.adSessionReport(request("/report", { sessionId: session, event: "shown" }))]) {
        expect(response.status).toBe(expected[0]);
        expect(await response.json()).toEqual({ error: { code: expected[1] } });
      }
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("refuses the removed heart target before the wallet is called", async () => {
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    expect((await open.exchange(request("/exchange", { ...ticket, target: "heart" }))).status).toBe(400);
    expect((await open.exchange(request("/exchange", { ...ticket, target: "support_voucher" }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("maps ad session failures for the ticket exchange", async () => {
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    for (const [code, status] of [["AD_SESSION_INVALID", 409], ["AD_DAILY_LIMIT", 429], ["AD_CONFIG_MISSING", 503]] as const) {
      vi.mocked(deps.rpc).mockRejectedValueOnce(new Error(`GROUP_WALLET_${code}`));
      const failed = await open.exchange(request("/exchange", ticket));
      expect(failed.status).toBe(status); expect(await failed.json()).toEqual({ error: { code: `GROUP_WALLET_${code}` } });
    }
  });
  it("drops a hearts balance the database may still return", async () => {
    const wallet = { sequence: 1, points: 100, hearts: 2, tickets: 3, policyVersion: "group-wallet-v1", pointCost: 100, writeFenced: false, attendance: { date: "2026-11-01", checkedIn: false, streak: 6, nextBonusIn: 1, days: [] } };
    vi.mocked(deps.rpc).mockResolvedValue(wallet);
    expect((await (await api.wallet(request("/wallet"))).json()).hearts).toBeUndefined();
  });
  it("passes configured limits to the database and fixes the ticket at one unit with a session", async () => {
    vi.mocked(deps.rpc).mockResolvedValue(receipt);
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    expect((await open.exchange(request("/exchange", ticket))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("exchange_owned_group_wallet", { p_app_user_id: owner, p_request_key: key, p_policy_version: "group-wallet-v1", p_target: "ticket", p_units: 1, p_ad_session_id: session, p_daily_cap: 7 });
    vi.mocked(deps.rpc).mockClear();
    expect((await open.exchange(request("/exchange", { ...ticket, units: 2 }))).status).toBe(400);
    const { adSessionId: _drop, ...noSession } = ticket;
    const missing = await open.exchange(request("/exchange", noSession));
    expect(missing.status).toBe(400); expect(await missing.json()).toEqual({ error: { code: "GROUP_WALLET_AD_SESSION_REQUIRED" } });
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("issues and reports sessions with server configuration, never client limits", async () => {
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    vi.mocked(deps.rpc).mockResolvedValue({ sessionId: session, status: "issued", expiresAt: "2026-11-04T00:00:00Z" });
    expect((await open.adSession(request("/ad-session", {}))).status).toBe(200);
    expect(deps.rpc).toHaveBeenLastCalledWith("issue_owned_group_wallet_ad_session", { p_app_user_id: owner, p_ttl_seconds: 11, p_issue_limit: 5, p_issue_window_seconds: 13, p_daily_cap: 7 });
    expect((await open.adSessionReport(request("/report", { sessionId: session, event: "granted" }))).status).toBe(200);
    expect(deps.rpc).toHaveBeenLastCalledWith("report_owned_group_wallet_ad_session", { p_app_user_id: owner, p_session_id: session, p_event: "granted", p_min_watch_seconds: 3 });
    vi.mocked(deps.rpc).mockClear();
    for (const bad of [{ ttl: 1 }, { dailyCap: 99 }]) expect((await open.adSession(request("/ad-session", bad))).status).toBe(400);
    expect((await open.adSessionReport(request("/report", { sessionId: session, event: "consumed" }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("maps ad-session failures without SQL details", async () => {
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    for (const [code, status] of [["AD_SESSION_INVALID", 409], ["AD_DAILY_LIMIT", 429], ["AD_RATE_LIMITED", 429], ["INSUFFICIENT_BALANCE", 409]] as const) {
      vi.mocked(deps.rpc).mockRejectedValueOnce(new Error(`GROUP_WALLET_${code}: secret`));
      const result = await open.adSession(request("/ad-session", {})); expect(result.status).toBe(status);
      expect(await result.json()).toEqual({ error: { code: `GROUP_WALLET_${code}` } });
    }
  });
  it("tells old check-in callers that attendance moved after the dukjil cutover", async () => {
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("DUKJIL_ATTENDANCE_MOVED"));
    const result = await api.checkIn(request("/check-in", { requestKey: key }));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: { code: "DUKJIL_ATTENDANCE_MOVED" } });
  });
  it("does not accept client dates or streak values", async () => {
    for (const body of [{ requestKey: key, date: "2026-01-01" }, { requestKey: key, streak: 7 }]) expect((await api.checkIn(request("/check-in", body))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("recovers owned committed transactions by the original key", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ status: "unknown" });
    expect(await (await api.request(request("/request"), key)).json()).toEqual({ status: "unknown" });
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_group_wallet_request", { p_app_user_id: owner, p_request_key: key });
  });
  it("maps fences and conflicts without returning SQL details", async () => {
    for (const [code, status] of [["WRITE_FENCED", 503], ["INSUFFICIENT_BALANCE", 409], ["REQUEST_CONFLICT", 409]] as const) {
      vi.mocked(deps.rpc).mockRejectedValueOnce(new Error(`GROUP_WALLET_${code}: secret connection`));
      const result = await api.wallet(request("/wallet")); expect(result.status).toBe(status); expect(JSON.stringify(await result.json())).not.toContain("secret");
    }
  });
  it("passes the activity and correction reason of 덕질 rows through, and older rows without them", async () => {
    const row = { id: key, asset: "fan_point", amount: -20, sourceType: "dukjil_correction", sourceId: session, celebrityId: null, createdAt: "2026-11-06T00:00:00Z" };
    const entries = [{ ...row, actionKey: "post", correctionReason: "content_deleted" }, { ...row, amount: 5, sourceType: "dukjil_action", actionKey: "comment", correctionReason: null }, { ...row, amount: 3, sourceType: "group_check_in" }];
    vi.mocked(deps.rpc).mockResolvedValue({ entries });
    const response = await api.history(request("/history"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries });
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_group_wallet_history", { p_app_user_id: owner, p_limit: 30 });
  });
  it("reads ledger ids that Postgres derived without RFC version bits (md5(...)::uuid)", async () => {
    const entries = [{ id: key, asset: "fan_point", amount: 1000, sourceType: "group_check_in", sourceId: "09b85f08-8bbe-54b1-c53d-5ea9948e16a3", celebrityId: null, createdAt: "2026-11-07T13:13:09Z" }];
    vi.mocked(deps.rpc).mockResolvedValue({ entries });
    const response = await api.history(request("/history"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries });
  });
  it("bounds history queries and rejects duplicate limit keys", async () => {
    for (const path of ["/history?limit=101", "/history?limit=1&limit=2"]) expect((await api.history(request(path))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("keeps a legacy transaction distinct from an unknown request", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ status: "legacy", requiresOriginalContext: true });
    expect(await (await api.request(request("/request"), key)).json()).toEqual({ status: "legacy", requiresOriginalContext: true });
  });

});
