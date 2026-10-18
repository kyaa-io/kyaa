import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationTypeV2 } from "@apple/app-store-server-library";
vi.mock("server-only", () => ({}));
vi.mock("./apple-verifier", () => ({ verifyAppleNotification: vi.fn(), verifyAppleTransaction: vi.fn() }));
vi.mock("./google-verifier", async (original) => {
  const actual = await original<typeof import("./google-verifier")>();
  return { ...actual, verifyGooglePurchase: vi.fn(async () => ({ store: "google", environment: "sandbox", externalTransactionId: "token:" + "a".repeat(64), profileId: "57000000-0000-4000-8000-000000000001", productId: "kr.byus.ticket.10", currency: "KRW", amountKrw: 1000, refundedKrw: 0, storeState: "purchased", verificationFingerprint: "b".repeat(64), storeEventAt: null })) };
});
import { createMobileStoreWebhookHandlers } from "./webhooks";
import { verifyGooglePurchase } from "./google-verifier";
import { verifyAppleNotification, verifyAppleTransaction } from "./apple-verifier";

function request(token = "valid") {
  const notification = { packageName: "kr.byus.app", oneTimeProductNotification: { purchaseToken: "purchase", sku: "kr.byus.ticket.10" } };
  return new Request("https://byus.test/api/store/webhooks/google", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(notification)).toString("base64") } }) });
}
function fixture() {
  const repository = { applyVerified: vi.fn(async () => ({})) };
  const verifyGoogleAuthorization = vi.fn(async () => undefined);
  const handlers = createMobileStoreWebhookHandlers({ repository, getAppleConfig: () => ({ roots: "unused", bundleId: "kr.kyaa.app" }), getGoogleConfig: () => ({ audience: "https://byus.test/hook", serviceAccountEmail: "push@project.iam.gserviceaccount.com", packageName: "kr.byus.app", client: { getPurchase: vi.fn(), getOrder: vi.fn() } }), verifyGoogleAuthorization } as never);
  return { handlers, repository, verifyGoogleAuthorization };
}
describe("mobile Store webhooks", () => {
  beforeEach(() => vi.clearAllMocks());
  it("verifies Apple test notifications without requiring a transaction", async () => {
    vi.mocked(verifyAppleNotification).mockResolvedValueOnce({ notificationType: NotificationTypeV2.TEST });
    const { handlers, repository } = fixture();
    const result = await handlers.apple(new Request("https://byus.test", { method: "POST", body: JSON.stringify({ signedPayload: "test-envelope" }) }));
    expect(result.status).toBe(204);
    expect(verifyAppleNotification).toHaveBeenCalledOnce();
    expect(verifyAppleTransaction).not.toHaveBeenCalled();
    expect(repository.applyVerified).not.toHaveBeenCalled();
  });
  it("re-fetches the verified purchase for a Google voided-purchase event", async () => {
    const { handlers, repository } = fixture();
    const notification = { packageName: "kr.byus.app", voidedPurchaseNotification: { purchaseToken: "refunded-token", orderId: "GPA.1", productType: 2, refundType: 1 } };
    const value = new Request("https://byus.test", { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(notification)).toString("base64") } }) });
    expect((await handlers.google(value)).status).toBe(204);
    expect(verifyGooglePurchase).toHaveBeenCalledWith("refunded-token", null, expect.anything());
    expect(repository.applyVerified).toHaveBeenCalledOnce();
  });
  it("acknowledges authenticated Google test notifications without granting anything", async () => {
    const { handlers, repository } = fixture();
    const notification = { packageName: "kr.byus.app", testNotification: { version: "1.0" } };
    const value = new Request("https://byus.test", { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(notification)).toString("base64") } }) });
    expect((await handlers.google(value)).status).toBe(204);
    expect(verifyGooglePurchase).not.toHaveBeenCalled();
    expect(repository.applyVerified).not.toHaveBeenCalled();
  });
  it("authenticates Google Pub/Sub before applying provider data", async () => {
    const { handlers, repository, verifyGoogleAuthorization } = fixture();
    expect((await handlers.google(request())).status).toBe(204);
    expect(verifyGoogleAuthorization).toHaveBeenCalledWith("valid", "https://byus.test/hook", "push@project.iam.gserviceaccount.com");
    expect(repository.applyVerified).toHaveBeenCalledOnce();
  });
  it("returns retryable failure when durable application fails", async () => {
    const { handlers, repository } = fixture(); repository.applyVerified.mockRejectedValue(new Error("database unavailable"));
    expect((await handlers.google(request())).status).toBe(503);
  });
  it("rejects unauthenticated delivery before parsing it", async () => {
    const { handlers, repository } = fixture();
    expect((await handlers.google(new Request("https://byus.test", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(repository.applyVerified).not.toHaveBeenCalled();
  });
});
