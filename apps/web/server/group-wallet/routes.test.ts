import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGroupWalletHandlers, type GroupWalletDependencies } from "./routes";
const owner = "11111111-1111-4111-8111-111111111111", key = "22222222-2222-4222-8222-222222222222";
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
  it("rejects ticket conversion without a server-enabled ad gate and never touches the wallet", async () => {
    const input = { requestKey: key, policyVersion: "group-wallet-v1", target: "ticket", units: 1 };
    for (const gated of [createGroupWalletHandlers(deps), createGroupWalletHandlers({ ...deps, rewardedTicketExchangeEnabled: false })]) {
      const response = await gated.exchange(request("/exchange", input));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "GROUP_WALLET_AD_GATE_CLOSED" } });
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("lets ticket conversion through only when the server gate is explicitly open", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ requestKey: key, target: "ticket", units: 1, pointsSpent: 100, pointLedgerId: key, creditLedgerId: key, policyVersion: "group-wallet-v1", createdAt: "2026-11-01T00:00:00Z", replayed: false });
    const open = createGroupWalletHandlers({ ...deps, rewardedTicketExchangeEnabled: true });
    expect((await open.exchange(request("/exchange", { requestKey: key, policyVersion: "group-wallet-v1", target: "ticket", units: 1 }))).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
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
