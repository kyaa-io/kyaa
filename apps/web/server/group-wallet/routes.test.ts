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
    const wallet = { sequence: 1, points: 100, hearts: 2, tickets: 3, policyVersion: "group-wallet-v1", pointCost: 100, writeFenced: false, attendance: { date: "2026-11-01", checkedIn: false, streak: 6, nextBonusIn: 1, days: [] } };
    vi.mocked(deps.rpc).mockResolvedValue(wallet);
    const response = await api.wallet(request("/wallet"));
    expect(await response.json()).toEqual(wallet);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_group_wallet", { p_app_user_id: owner });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not turn an unavailable or malformed wallet into zero balances", async () => {
    for (const result of [{ points: 0 }, { points: -1 }, null]) { vi.mocked(deps.rpc).mockResolvedValue(result); expect((await api.wallet(request("/wallet"))).status).toBe(503); }
  });
  it("rejects owner injection, noninteger quantities and client-selected price", async () => {
    const input = { requestKey: key, policyVersion: "group-wallet-v1", target: "heart", units: 1 };
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
  const heart = { ...ticket, target: "heart" };
  it("gates hearts exactly like tickets: closed or unconfigured settings and a missing session never reach the wallet", async () => {
    for (const decision of [undefined, { enabled: false, reason: "gate_closed" }, { enabled: false, reason: "config_missing" }] as const) {
      const gated = createGroupWalletHandlers({ ...deps, rewardedExchange: decision });
      const response = await gated.exchange(request("/exchange", heart));
      expect(response.status).toBe(decision?.reason === "config_missing" ? 503 : 403);
      expect(await response.json()).toEqual({ error: { code: decision?.reason === "config_missing" ? "GROUP_WALLET_AD_CONFIG_MISSING" : "GROUP_WALLET_AD_GATE_CLOSED" } });
    }
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    const { adSessionId: _drop, ...noSession } = heart;
    const missing = await open.exchange(request("/exchange", noSession));
    expect(missing.status).toBe(400); expect(await missing.json()).toEqual({ error: { code: "GROUP_WALLET_AD_SESSION_REQUIRED" } });
    for (const units of [2, 3, 1000]) expect((await open.exchange(request("/exchange", { ...heart, units }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("sends a heart with its ad session and the configured daily cap, and maps session failures", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ ...receipt, target: "heart" });
    const open = createGroupWalletHandlers({ ...deps, rewardedExchange: openDecision });
    expect((await open.exchange(request("/exchange", heart))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("exchange_owned_group_wallet", { p_app_user_id: owner, p_request_key: key, p_policy_version: "group-wallet-v1", p_target: "heart", p_units: 1, p_ad_session_id: session, p_daily_cap: 7 });
    for (const [code, status] of [["AD_SESSION_INVALID", 409], ["AD_DAILY_LIMIT", 429], ["AD_CONFIG_MISSING", 503]] as const) {
      vi.mocked(deps.rpc).mockRejectedValueOnce(new Error(`GROUP_WALLET_${code}`));
      const failed = await open.exchange(request("/exchange", heart));
      expect(failed.status).toBe(status); expect(await failed.json()).toEqual({ error: { code: `GROUP_WALLET_${code}` } });
    }
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
  it("bounds history queries and rejects duplicate limit keys", async () => {
    for (const path of ["/history?limit=101", "/history?limit=1&limit=2"]) expect((await api.history(request(path))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("sends hearts only with the owned global policy and explicit artist", async () => {
    const receipt = { requestKey: key, celebrityId: owner, units: 1, voucherLedgerId: key, policyVersion: "group-wallet-v1", createdAt: "2026-11-01T00:00:00Z", replayed: false };
    vi.mocked(deps.rpc).mockResolvedValue(receipt);
    expect(await (await api.support(request("/support", { requestKey: key, celebritySlug: "nchive", policyVersion: "group-wallet-v1", units: 1 }))).json()).toEqual(receipt);
    expect(deps.rpc).toHaveBeenCalledWith("send_owned_group_wallet_support", { p_app_user_id: owner, p_request_key: key, p_policy_version: "group-wallet-v1", p_celebrity_slug: "nchive", p_units: 1 });
  });
  it("keeps a legacy transaction distinct from an unknown request", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ status: "legacy", requiresOriginalContext: true });
    expect(await (await api.request(request("/request"), key)).json()).toEqual({ status: "legacy", requiresOriginalContext: true });
  });

});
