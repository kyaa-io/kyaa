import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createMobileStoreHandlers } from "./routes";

const product = { productId: "kr.byus.ticket.10", currency: "KRW" as const, ticketQuantity: 10, supportRateBps: 1000, policyVersion: "sandbox-v1", paidCampaign: { benefitId: "57000000-0000-4000-8000-000000000099", policyVersion: "paid-v1", ticketCost: 1, opensAt: "2026-10-12T00:00:00Z", closesAt: "2026-10-13T00:00:00Z", allowedTicketSources: ["free", "paid"] as const, totalWeight: 10, outcomes: [{ outcome: "won" as const, weight: 1, fulfillmentMethod: "digital" as const, remainingInventory: 5 }, { outcome: "not_selected" as const, weight: 9, fulfillmentMethod: null, remainingInventory: null }] } };
function fixture() {
  const repository = {
    listProducts: vi.fn(async () => ({ products: [product] })), createIntent: vi.fn(async () => ({ id: "57000000-0000-4000-8000-000000000001" })),
    getOwnedTransactions: vi.fn(async () => ({ transactions: [] })), applyOwnedVerified: vi.fn(async () => ({ state: "granted" })),
    getOwnedSupport: vi.fn(async () => ({ celebrityId: "57000000-0000-4000-8000-000000000002", totalSupportKrw: 100, purchases: [], entries: [] })),
  };
  const verified = { store: "apple" as const, environment: "sandbox" as const, externalTransactionId: "tx", profileId: "57000000-0000-4000-8000-000000000001", productId: product.productId, currency: "KRW", amountKrw: 1000, refundedKrw: 0, storeState: "purchased" as const, verificationFingerprint: "a".repeat(64), storeEventAt: null };
  const dependencies = { authorize: vi.fn(async () => ({ appUserId: "owner" })), repository, verifyApple: vi.fn(async () => verified), verifyGoogle: vi.fn(async () => ({ ...verified, store: "google" as const })) };
  return { repository, dependencies, handlers: createMobileStoreHandlers(dependencies as never) };
}

describe("mobile Store routes", () => {
  it("lists server policy without a client price", async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.products(new Request("https://byus.test/api/me/store/products?store=apple&celebritySlug=creator"));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ products: [product] });
    expect(repository.listProducts).toHaveBeenCalledWith("owner", "apple", "creator");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("keeps policyVersion opaque and rejects numeric versions", async () => {
    const valid = { requestKey: "57000000-0000-4000-8000-000000000009", store: "apple", productId: product.productId, celebritySlug: "creator", policyVersion: "sandbox-v1", expectedPaidCampaign: { benefitId: product.paidCampaign.benefitId, policyVersion: product.paidCampaign.policyVersion } };
    const first = fixture();
    expect((await first.handlers.intents(new Request("https://byus.test/api/me/store/intents", { method: "POST", body: JSON.stringify(valid) }))).status).toBe(200);
    expect(first.repository.createIntent).toHaveBeenCalledWith("owner", valid);
    const second = fixture();
    const response = await second.handlers.intents(new Request("https://byus.test/api/me/store/intents", { method: "POST", body: JSON.stringify({ ...valid, policyVersion: 1 }) }));
    expect(response.status).toBe(400); expect(second.repository.createIntent).not.toHaveBeenCalled();
  });
  it("requires the paid campaign snapshot shown with the product", async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.intents(new Request("https://byus.test/api/me/store/intents", { method: "POST", body: JSON.stringify({ requestKey: "57000000-0000-4000-8000-000000000009", store: "apple", productId: product.productId, celebritySlug: "creator", policyVersion: "sandbox-v1" }) }));
    expect(response.status).toBe(400); expect(repository.createIntent).not.toHaveBeenCalled();
  });
  it("returns forbidden when the server-side sandbox tester gate rejects the account", async () => {
    const { handlers, repository } = fixture();
    repository.listProducts.mockRejectedValueOnce(new Error("MOBILE_STORE_TESTER_REQUIRED"));
    const response = await handlers.products(new Request("https://byus.test/api/me/store/products?store=apple&celebritySlug=creator"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "FORBIDDEN" } });
  });
  it("applies only a provider-verified transaction to the authenticated owner", async () => {
    const { handlers, dependencies, repository } = fixture();
    const response = await handlers.verify(new Request("https://byus.test/api/me/store/transactions/verify", { method: "POST", body: JSON.stringify({ store: "apple", signedTransactionInfo: "signed" }) }));
    expect(response.status).toBe(200); expect(dependencies.verifyApple).toHaveBeenCalledWith("signed");
    expect(repository.applyOwnedVerified).toHaveBeenCalledWith("owner", expect.objectContaining({ externalTransactionId: "tx" }));
  });
  it("reads the authenticated owner's support total and ledger", async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.support(new Request("https://byus.test/api/me/store/support?celebritySlug=creator&limit=25"));
    expect(response.status).toBe(200); expect(repository.getOwnedSupport).toHaveBeenCalledWith("owner", "creator", 25, null, null);
  });
  it("validates support cursors and isolates details to the authenticated owner", async () => {
    const { handlers, repository } = fixture();
    const id = "57000000-0000-4000-8000-000000000004";
    const at = "2026-10-12T00:00:00Z";
    expect((await handlers.support(new Request(`https://byus.test/api/me/store/support?celebritySlug=creator&cursorAt=${at}&cursorId=${id}`))).status).toBe(200);
    expect(repository.getOwnedSupport).toHaveBeenLastCalledWith("owner", "creator", 50, { createdAt: at, id }, null);
    expect((await handlers.support(new Request(`https://byus.test/api/me/store/support?celebritySlug=creator&transactionId=${id}`))).status).toBe(200);
    expect(repository.getOwnedSupport).toHaveBeenLastCalledWith("owner", "creator", 50, null, id);
    for (const suffix of [`cursorId=${id}`, `cursorAt=invalid&cursorId=${id}`, `transactionId=invalid`, `cursorAt=${at}&cursorId=${id}&transactionId=${id}`]) {
      expect((await handlers.support(new Request(`https://byus.test/api/me/store/support?celebritySlug=creator&${suffix}`))).status).toBe(400);
    }
    expect(repository.getOwnedSupport).toHaveBeenCalledTimes(2);
  });
});
