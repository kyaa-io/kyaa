import "server-only";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { VerifiedStoreTransaction } from "./domain";

const offerDetailsSchema = z.object({ quantity: z.number().int().nonnegative().optional(), refundableQuantity: z.number().int().nonnegative().optional() }).passthrough();
const purchaseSchema = z.object({
  orderId: z.string().min(1).optional(),
  purchaseStateContext: z.object({ purchaseState: z.enum(["PURCHASED", "PENDING", "CANCELLED"]) }).passthrough(),
  testPurchaseContext: z.object({ fopType: z.literal("TEST") }).passthrough().optional(), purchaseCompletionTime: z.string().optional(), acknowledgementState: z.string().optional(),
  obfuscatedExternalProfileId: z.string().optional(),
  productLineItem: z.array(z.object({ productId: z.string().min(1), productOfferDetails: offerDetailsSchema.optional() }).passthrough()).min(1),
}).passthrough();
const moneySchema = z.object({ currencyCode: z.string().length(3), units: z.union([z.string(), z.number().int()]).optional(), nanos: z.number().int().min(-999_999_999).max(999_999_999).optional() }).passthrough();
const refundDetailsSchema = z.object({ total: moneySchema, tax: moneySchema.optional() }).passthrough();
const orderSchema = z.object({
  orderId: z.string().min(1), purchaseToken: z.string().min(1),
  state: z.enum(["PENDING", "PROCESSED", "CANCELED", "PENDING_REFUND", "PARTIALLY_REFUNDED", "REFUNDED"]), total: moneySchema.optional(),
  lineItems: z.array(z.object({ productId: z.string().min(1), total: moneySchema.optional(),
    oneTimePurchaseDetails: z.object({ quantity: z.number().int().positive().optional() }).passthrough().optional() }).passthrough()).min(1),
  orderHistory: z.object({
    partialRefundEvents: z.array(z.object({ state: z.enum(["PENDING", "PROCESSED_SUCCESSFULLY"]), refundDetails: refundDetailsSchema }).passthrough()).optional(),
    refundEvent: z.object({ refundDetails: refundDetailsSchema }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

export class GoogleStoreVerificationError extends Error {
  constructor(readonly reason: "CONFIGURATION" | "AUTH" | "PROVIDER" | "PURCHASE" | "AMOUNT") { super(`GOOGLE_STORE_${reason}`); }
}

export interface GoogleStoreConfig { packageName: string; clientEmail: string; privateKey: string; }
export type StoreFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
const TOKEN_RESPONSE_LIMIT = 64 * 1024;
const PROVIDER_RESPONSE_LIMIT = 512 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

async function fetchJsonBounded(fetcher: StoreFetch, input: string, init: RequestInit, limit: number): Promise<{ response: Response; body: unknown }> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetcher(input, { ...init, signal, redirect: "error", cache: "no-store" });
  return { response, body: JSON.parse(await boundedText(response, limit)) };
}

function encodePath(value: string): string { return encodeURIComponent(value); }

export class GooglePlayDeveloperClient {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly config: GoogleStoreConfig, private readonly fetcher: StoreFetch = fetch) {}
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    try {
      const now = Math.floor(Date.now() / 1000);
      const key = await importPKCS8(this.config.privateKey.replace(/\\n/gu, "\n"), "RS256");
      const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(this.config.clientEmail).setSubject(this.config.clientEmail)
        .setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
      const { response, body: rawBody } = await fetchJsonBounded(this.fetcher, "https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      }, TOKEN_RESPONSE_LIMIT);
      if (!response.ok) throw new Error("token");
      const body = z.object({ access_token: z.string().min(1).max(16_384), expires_in: z.number().int().positive() }).parse(rawBody);
      this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
      return body.access_token;
    } catch { throw new GoogleStoreVerificationError("AUTH"); }
  }
  private async get(path: string): Promise<unknown> {
    try {
      const { response, body } = await fetchJsonBounded(this.fetcher,
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodePath(this.config.packageName)}/${path}`,
        { headers: { authorization: `Bearer ${await this.accessToken()}` } }, PROVIDER_RESPONSE_LIMIT);
      if (!response.ok) throw new GoogleStoreVerificationError("PROVIDER");
      return body;
    } catch (error) {
      if (error instanceof GoogleStoreVerificationError) throw error;
      throw new GoogleStoreVerificationError("PROVIDER");
    }
  }
  getPurchase(purchaseToken: string) { return this.get(`purchases/productsv2/tokens/${encodePath(purchaseToken)}`); }
  getOrder(orderId: string) { return this.get(`orders/${encodePath(orderId)}`); }
}

function moneyToKrw(value: unknown): number {
  const money = moneySchema.parse(value);
  let units: bigint;
  try { units = BigInt(money.units ?? 0); } catch { throw new GoogleStoreVerificationError("AMOUNT"); }
  if (money.currencyCode !== "KRW" || (money.nanos ?? 0) !== 0 || units < 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) throw new GoogleStoreVerificationError("AMOUNT");
  return Number(units);
}

function parseOrder(rawOrder: unknown, orderId: string, purchaseToken: string, productId: string) {
  let order: z.infer<typeof orderSchema>;
  try { order = orderSchema.parse(rawOrder); } catch { throw new GoogleStoreVerificationError("AMOUNT"); }
  if (order.orderId !== orderId || order.purchaseToken !== purchaseToken || order.lineItems.length !== 1 || order.lineItems[0].productId !== productId) throw new GoogleStoreVerificationError("PURCHASE");
  const currency = order.total?.currencyCode ?? null;
  const amount = currency === "KRW" ? moneyToKrw(order.total) : null;
  let refunded = 0;
  for (const event of order.orderHistory?.partialRefundEvents ?? []) {
    if (event.state === "PROCESSED_SUCCESSFULLY") refunded += moneyToKrw(event.refundDetails.total);
  }
  if (order.orderHistory?.refundEvent) refunded += moneyToKrw(order.orderHistory.refundEvent.refundDetails.total);
  return { currency, amount, refunded: amount === null ? refunded : Math.min(amount, refunded), state: order.state,
    quantityKnown: order.lineItems[0].oneTimePurchaseDetails?.quantity === 1 };
}

export async function verifyGooglePurchase(purchaseToken: string, expectedProductId: string | null,
  client: Pick<GooglePlayDeveloperClient, "getPurchase" | "getOrder">): Promise<VerifiedStoreTransaction> {
  if (!purchaseToken || purchaseToken.length > 4096) throw new GoogleStoreVerificationError("PURCHASE");
  let purchase: z.infer<typeof purchaseSchema>;
  try { purchase = purchaseSchema.parse(await client.getPurchase(purchaseToken)); }
  catch (error) { if (error instanceof GoogleStoreVerificationError) throw error; throw new GoogleStoreVerificationError("PURCHASE"); }
  const productIds = [...new Set(purchase.productLineItem.map((item) => item.productId))];
  if (productIds.length !== 1 || purchase.productLineItem.length !== 1 || (expectedProductId !== null && productIds[0] !== expectedProductId)) throw new GoogleStoreVerificationError("PURCHASE");
  const offer = purchase.productLineItem[0].productOfferDetails;
  const purchaseQuantityKnown = offer?.quantity === 1 && (offer.refundableQuantity === 0 || offer.refundableQuantity === 1);
  const order = purchase.orderId ? parseOrder(await client.getOrder(purchase.orderId), purchase.orderId, purchaseToken, productIds[0])
    : { currency: null, amount: null, refunded: 0, state: "PENDING" as const, quantityKnown: false };
  const quantityKnown = purchaseQuantityKnown && order.quantityKnown;
  const refundedByQuantity = offer?.quantity === 1 && offer.refundableQuantity === 0;
  const orderRevoked = order.state === "CANCELED" || order.state === "REFUNDED";
  const orderPending = order.state === "PENDING" || order.state === "PENDING_REFUND";
  const purchaseState = purchase.purchaseStateContext.purchaseState;
  const storeState = purchaseState === "PENDING" || orderPending ? "pending" : purchaseState === "CANCELLED" || refundedByQuantity || orderRevoked ? "revoked" : "purchased";
  const amountKrw = quantityKnown ? order.amount : null;
  const refundedKrw = storeState === "revoked" && amountKrw !== null ? amountKrw : order.refunded;
  return {
    store: "google", environment: purchase.testPurchaseContext === undefined ? "production" : "sandbox",
    externalTransactionId: `token:${createHash("sha256").update(purchaseToken).digest("hex")}`,
    profileId: purchase.obfuscatedExternalProfileId ?? null, productId: productIds[0], currency: order.currency,
    amountKrw, refundedKrw, storeState, verificationFingerprint: createHash("sha256").update(purchaseToken).digest("hex"),
    storeEventAt: purchase.purchaseCompletionTime ? new Date(purchase.purchaseCompletionTime).toISOString() : null,
  };
}

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5_000 });
export async function verifyGoogleWebhookAuthorization(token: string, audience: string, expectedEmail: string, getKey: JWTVerifyGetKey = googleJwks): Promise<void> {
  try {
    const { payload } = await jwtVerify(token, getKey, { algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"], audience,
      requiredClaims: ["iss", "aud", "sub", "iat", "exp", "email", "email_verified"], maxTokenAge: "10m" });
    if (payload.email !== expectedEmail || payload.email_verified !== true) throw new Error("signer");
  } catch { throw new GoogleStoreVerificationError("AUTH"); }
}
