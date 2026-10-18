import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, SignJWT, type CryptoKey } from "jose";
vi.mock("server-only", () => ({}));
import { GooglePlayDeveloperClient, GoogleStoreVerificationError, verifyGooglePurchase, verifyGoogleWebhookAuthorization } from "./google-verifier";

// jsdom installs a different Uint8Array constructor after jose creates its
// module-level TextEncoder; restore Node's constructor for jose's realm check.
Object.defineProperty(globalThis, "Uint8Array", {
  configurable: true,
  value: Object.getPrototypeOf(Buffer.prototype).constructor,
});

const profileId = "57000000-0000-4000-8000-000000000001";
const purchaseToken = "purchase-token";
const productId = "kr.byus.ticket.10";
const purchase = {
  orderId: "GPA.1", purchaseStateContext: { purchaseState: "PURCHASED" }, testPurchaseContext: { fopType: "TEST" },
  purchaseCompletionTime: "2026-10-11T00:00:00Z", obfuscatedExternalProfileId: profileId,
  productLineItem: [{ productId, productOfferDetails: { purchaseOptionId: "default", quantity: 1, refundableQuantity: 1, consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED" } }],
};
const money = (units: string) => ({ currencyCode: "KRW", units, nanos: 0 });
const order = {
  orderId: "GPA.1", purchaseToken, state: "PARTIALLY_REFUNDED", createTime: "2026-10-11T00:00:00Z", lastEventTime: "2026-10-11T02:00:00Z",
  total: money("1000"), lineItems: [{ productId, listingPrice: money("1000"), total: money("1000"), oneTimePurchaseDetails: { quantity: 1, purchaseOptionId: "default" } }],
  orderHistory: { processedEvent: { eventTime: "2026-10-11T00:00:00Z" }, partialRefundEvents: [
    { createTime: "2026-10-11T01:00:00Z", processTime: "2026-10-11T01:01:00Z", state: "PROCESSED_SUCCESSFULLY", refundDetails: { total: money("200"), tax: money("0") } },
    { createTime: "2026-10-11T01:30:00Z", state: "PENDING", refundDetails: { total: money("300"), tax: money("0") } },
    { createTime: "2026-10-11T02:00:00Z", processTime: "2026-10-11T02:01:00Z", state: "PROCESSED_SUCCESSFULLY", refundDetails: { total: money("100"), tax: money("0") } },
  ] },
};

describe("Google Play purchase verification", () => {
  it("parses the documented top-level profile ID and OrderHistory object", async () => {
    const client = { getPurchase: vi.fn(async () => purchase), getOrder: vi.fn(async () => order) };
    const result = await verifyGooglePurchase(purchaseToken, productId, client);
    expect(result).toMatchObject({ store: "google", environment: "sandbox", profileId, amountKrw: 1000, refundedKrw: 300, storeState: "purchased" });
    expect(result.externalTransactionId).toMatch(/^token:[a-f0-9]{64}$/u);
  });
  it("computes cumulative partial refunds independent of event ordering", async () => {
    const reversed = { ...order, orderHistory: { ...order.orderHistory, partialRefundEvents: [...order.orderHistory.partialRefundEvents].reverse() } };
    const client = { getPurchase: vi.fn(async () => purchase), getOrder: vi.fn(async () => reversed) };
    expect((await verifyGooglePurchase(purchaseToken, productId, client)).refundedKrw).toBe(300);
  });
  it("adds a documented full-refund event and caps cumulative refund at the order total", async () => {
    const refundedOrder = { ...order, state: "REFUNDED", orderHistory: { ...order.orderHistory, refundEvent: { eventTime: "2026-10-11T03:00:00Z", refundReason: "OTHER", refundDetails: { total: money("700"), tax: money("0") } } } };
    const result = await verifyGooglePurchase(purchaseToken, productId, { getPurchase: vi.fn(async () => purchase), getOrder: vi.fn(async () => refundedOrder) });
    expect(result).toMatchObject({ refundedKrw: 1000, storeState: "revoked" });
  });
  it("fully reverses a refunded order even when its event history has not arrived", async () => {
    const refundedOrder = { ...order, state: "REFUNDED", orderHistory: undefined };
    const result = await verifyGooglePurchase(purchaseToken, productId, { getPurchase: vi.fn(async () => purchase), getOrder: vi.fn(async () => refundedOrder) });
    expect(result).toMatchObject({ amountKrw: 1000, refundedKrw: 1000, storeState: "revoked" });
  });
  it.each([null, {}, { fopType: "FOP_TYPE_UNSPECIFIED" }])("rejects ambiguous test-purchase evidence %j", async (testPurchaseContext) => {
    await expect(verifyGooglePurchase(purchaseToken, productId, {
      getPurchase: vi.fn(async () => ({ ...purchase, testPurchaseContext })), getOrder: vi.fn(async () => order),
    })).rejects.toMatchObject({ reason: "PURCHASE" });
  });
  it.each([
    { fixture: { ...purchase, productLineItem: [{ productId, productOfferDetails: { quantity: 2, refundableQuantity: 2 } }] }, orderFixture: order },
    { fixture: { ...purchase, productLineItem: [{ productId, productOfferDetails: {} }] }, orderFixture: order },
    { fixture: purchase, orderFixture: { ...order, lineItems: [{ ...order.lineItems[0], oneTimePurchaseDetails: { quantity: 2 } }] } },
  ])("withholds a grant when quantity evidence is not exactly one", async ({ fixture, orderFixture }) => {
    const result = await verifyGooglePurchase(purchaseToken, productId, { getPurchase: vi.fn(async () => fixture), getOrder: vi.fn(async () => orderFixture) });
    expect(result.amountKrw).toBeNull();
  });
});

describe("Google Pub/Sub OIDC", () => {
  let privateKey: CryptoKey;
  let getKey: ReturnType<typeof createLocalJWKSet>;
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true }); privateKey = pair.privateKey;
    getKey = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "google", use: "sig" }] });
  });
  async function token(email: string, verified: boolean) {
    return new SignJWT({ email, email_verified: verified }).setProtectedHeader({ alg: "RS256", kid: "google" })
      .setIssuer("https://accounts.google.com").setAudience("https://byus.test/hook").setSubject("subject").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  }
  it("binds the token to the configured push service account", async () => {
    await expect(verifyGoogleWebhookAuthorization(await token("push@project.iam.gserviceaccount.com", true), "https://byus.test/hook", "push@project.iam.gserviceaccount.com", getKey)).resolves.toBeUndefined();
    await expect(verifyGoogleWebhookAuthorization(await token("attacker@project.iam.gserviceaccount.com", true), "https://byus.test/hook", "push@project.iam.gserviceaccount.com", getKey)).rejects.toBeInstanceOf(GoogleStoreVerificationError);
    await expect(verifyGoogleWebhookAuthorization(await token("push@project.iam.gserviceaccount.com", false), "https://byus.test/hook", "push@project.iam.gserviceaccount.com", getKey)).rejects.toBeInstanceOf(GoogleStoreVerificationError);
  });
  it("bounds provider response bodies and supplies a request deadline", async () => {
    const privatePem = await exportPKCS8(privateKey);
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal); expect(init?.redirect).toBe("error");
      if (fetcher.mock.calls.length === 1) return Response.json({ access_token: "access", expires_in: 3600 });
      return new Response("{}", { headers: { "content-length": String(512 * 1024 + 1) } });
    });
    const client = new GooglePlayDeveloperClient({ packageName: "kr.kyaa.app", clientEmail: "service@example.test", privateKey: privatePem }, fetcher);
    await expect(client.getPurchase(purchaseToken)).rejects.toMatchObject({ reason: "PROVIDER" });
  });
});
