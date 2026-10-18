import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { AuthorizedFan } from "@/server/fan-auth/fan-auth-gate";
import { AppleStoreVerificationError } from "./apple-verifier";
import { expectedPaidCampaignSchema, storeSchema, supportCursorSchema } from "./domain";
import { GoogleStoreVerificationError } from "./google-verifier";
import type { MobileStoreRepository } from "./repository";

const intentBodySchema = z.object({ requestKey: z.uuid(), store: storeSchema, productId: z.string().min(1).max(200), celebritySlug: z.string().min(1).max(120), policyVersion: z.string().min(1).max(80), expectedPaidCampaign: expectedPaidCampaignSchema }).strict();
const verifyBodySchema = z.discriminatedUnion("store", [
  z.object({ store: z.literal("apple"), signedTransactionInfo: z.string().min(1).max(65_536) }).strict(),
  z.object({ store: z.literal("google"), purchaseToken: z.string().min(1).max(4096), productId: z.string().min(1).max(200) }).strict(),
]);
const headers = { "cache-control": "private, no-store", vary: "Authorization" };

export interface MobileStoreRouteDependencies {
  authorize(authorization: string): Promise<AuthorizedFan>;
  repository: MobileStoreRepository;
  verifyApple(signedTransactionInfo: string): ReturnType<MobileStoreRepository["applyVerified"]> extends Promise<infer _> ? Promise<import("./domain").VerifiedStoreTransaction> : never;
  verifyGoogle(purchaseToken: string, productId: string): Promise<import("./domain").VerifiedStoreTransaction>;
}

function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers }); }
function failure(error: unknown): Response {
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
  if (error instanceof AppleStoreVerificationError) return json({ error: { code: "INVALID_STORE_TRANSACTION" } }, 400);
  if (error instanceof GoogleStoreVerificationError) {
    const unavailable = ["AUTH", "CONFIGURATION", "PROVIDER"].includes(error.reason);
    return json({ error: { code: unavailable ? "STORE_VERIFICATION_UNAVAILABLE" : "INVALID_STORE_TRANSACTION" } }, unavailable ? 503 : 400);
  }
  const message = error instanceof Error ? error.message : "";
  const match = [
    ["MOBILE_STORE_ENTITLEMENT_MISMATCH", "ENTITLEMENT_MISMATCH", 409], ["MOBILE_STORE_POLICY_CHANGED", "POLICY_CHANGED", 409], ["MOBILE_STORE_IDEMPOTENCY_CONFLICT", "REQUEST_CONFLICT", 409],
    ["MOBILE_STORE_ACCOUNT_MISMATCH", "STORE_ACCOUNT_MISMATCH", 403], ["MOBILE_STORE_PRODUCT_UNAVAILABLE", "PRODUCT_UNAVAILABLE", 409],
    ["MOBILE_STORE_PAID_CAMPAIGN_CHANGED", "PAID_CAMPAIGN_CHANGED", 409],
    ["MOBILE_STORE_PAID_CAMPAIGN_UNAVAILABLE", "PAID_CAMPAIGN_UNAVAILABLE", 409],
    ["MOBILE_STORE_TESTER_REQUIRED", "FORBIDDEN", 403],
    ["MOBILE_STORE_FAVORITE_UNAVAILABLE", "FAVORITE_UNAVAILABLE", 409], ["MOBILE_STORE_INVALID", "INVALID_REQUEST", 400],
  ] as const;
  const known = match.find(([marker]) => message.includes(marker));
  return json({ error: { code: known?.[1] ?? "STORE_UNAVAILABLE" } }, known?.[2] ?? 503);
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(JSON.parse(await boundedText(request, 70_000)));
}

export function createMobileStoreHandlers(deps: MobileStoreRouteDependencies) {
  const fan = (request: Request) => deps.authorize(request.headers.get("authorization") ?? "");
  return {
    async products(request: Request): Promise<Response> {
      try {
        const owner = await fan(request); const url = new URL(request.url);
        const store = storeSchema.parse(url.searchParams.get("store"));
        const celebritySlug = z.string().min(1).max(120).parse(url.searchParams.get("celebritySlug"));
        return json(await deps.repository.listProducts(owner.appUserId, store, celebritySlug));
      } catch (error) { if (error instanceof z.ZodError) return json({ error: { code: "INVALID_REQUEST" } }, 400); return failure(error); }
    },
    async intents(request: Request): Promise<Response> {
      try { const owner = await fan(request); return json(await deps.repository.createIntent(owner.appUserId, await parseBody(request, intentBodySchema))); }
      catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400); return failure(error); }
    },
    async transactions(request: Request): Promise<Response> {
      try { return json(await deps.repository.getOwnedTransactions((await fan(request)).appUserId)); }
      catch (error) { return failure(error); }
    },
    async support(request: Request): Promise<Response> {
      try {
        const owner = await fan(request), query = new URL(request.url).searchParams;
        const cursor = query.has("cursorAt") || query.has("cursorId")
          ? supportCursorSchema.parse({ createdAt: query.get("cursorAt"), id: query.get("cursorId") }) : null;
        const transactionId = query.has("transactionId") ? z.uuid().parse(query.get("transactionId")) : null;
        if (cursor && transactionId) return json({ error: { code: "INVALID_REQUEST" } }, 400);
        return json(await deps.repository.getOwnedSupport(owner.appUserId,
          z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).parse(query.get("celebritySlug")),
          z.coerce.number().int().min(1).max(100).parse(query.get("limit") ?? 50), cursor, transactionId));
      }
      catch (error) { if (error instanceof z.ZodError) return json({ error: { code: "INVALID_REQUEST" } }, 400); return failure(error); }
    },
    async verify(request: Request): Promise<Response> {
      try {
        const owner = await fan(request); const body = await parseBody(request, verifyBodySchema);
        const verified = body.store === "apple" ? await deps.verifyApple(body.signedTransactionInfo) : await deps.verifyGoogle(body.purchaseToken, body.productId);
        return json({ transaction: await deps.repository.applyOwnedVerified(owner.appUserId, verified) });
      } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400); return failure(error); }
    },
  };
}
