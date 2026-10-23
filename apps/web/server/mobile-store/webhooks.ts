import "server-only";
import { z } from "zod";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import { verifyAppleNotification, verifyAppleTransaction } from "./apple-verifier";
import { GooglePlayDeveloperClient, GoogleStoreVerificationError, verifyGooglePurchase, verifyGoogleWebhookAuthorization } from "./google-verifier";
import type { MobileStoreRepository } from "./repository";

const appleBodySchema = z.object({ signedPayload: z.string().min(1).max(65_536) }).strict();
const googleEnvelopeSchema = z.object({ message: z.object({ data: z.string().min(1).max(100_000) }).passthrough() }).passthrough();
const googleNotificationSchema = z.object({
  packageName: z.string().min(1),
  oneTimeProductNotification: z.object({ purchaseToken: z.string().min(1).max(4096), sku: z.string().min(1).max(200) }).passthrough().optional(),
  voidedPurchaseNotification: z.object({ purchaseToken: z.string().min(1).max(4096), orderId: z.string().min(1), productType: z.union([z.literal(1), z.literal(2)]), refundType: z.union([z.literal(1), z.literal(2)]) }).passthrough().optional(),
  testNotification: z.object({ version: z.string().min(1) }).passthrough().optional(),
}).passthrough().refine((value) => [value.oneTimeProductNotification, value.voidedPurchaseNotification, value.testNotification].filter(Boolean).length === 1);

export interface MobileStoreWebhookDependencies {
  repository: { applyVerified(input: Parameters<MobileStoreRepository["applyVerified"]>[0]): Promise<unknown> };
  getAppleConfig(): { roots: string; bundleId: string; appAppleId?: number };
  getGoogleConfig(): { audience: string; serviceAccountEmail: string; packageName: string; client: Pick<GooglePlayDeveloperClient, "getPurchase" | "getOrder"> };
  verifyGoogleAuthorization(token: string, audience: string, expectedEmail: string): Promise<void>;
}

function response(status = 204): Response { return new Response(null, { status, headers: { "cache-control": "no-store" } }); }
function invalid(): Response { return Response.json({ error: { code: "INVALID_WEBHOOK" } }, { status: 400, headers: { "cache-control": "no-store" } }); }

export function createMobileStoreWebhookHandlers(deps: MobileStoreWebhookDependencies) {
  return {
    async apple(request: Request): Promise<Response> {
      let transaction: Awaited<ReturnType<typeof verifyAppleTransaction>>;
      let config: ReturnType<MobileStoreWebhookDependencies["getAppleConfig"]>;
      try { config = deps.getAppleConfig(); } catch { return response(503); }
      try {
        const body = appleBodySchema.parse(JSON.parse(await boundedText(request, 70_000)));
        const options = { trustedRootsPem: config.roots, bundleId: config.bundleId, appAppleId: config.appAppleId };
        const outer = await verifyAppleNotification(body.signedPayload, options);
        if (outer.notificationType === "TEST") return response();
        const signedTransactionInfo = z.string().min(1).max(65_536).parse(outer.data?.signedTransactionInfo);
        transaction = await verifyAppleTransaction(signedTransactionInfo, options);
      } catch { return invalid(); }
      try { await deps.repository.applyVerified(transaction); return response(); }
      catch { return response(503); }
    },
    async google(request: Request): Promise<Response> {
      const authorization = request.headers.get("authorization") ?? "";
      if (!authorization.startsWith("Bearer ")) return response(401);
      let config: ReturnType<MobileStoreWebhookDependencies["getGoogleConfig"]>;
      try { config = deps.getGoogleConfig(); } catch { return response(503); }
      try { await deps.verifyGoogleAuthorization(authorization.slice(7), config.audience, config.serviceAccountEmail); }
      catch { return response(401); }
      try {
        const envelope = googleEnvelopeSchema.parse(JSON.parse(await boundedText(request, 140_000)));
        const decoded = Buffer.from(envelope.message.data, "base64");
        if (decoded.byteLength > 70_000) return invalid();
        const notification = googleNotificationSchema.parse(JSON.parse(decoded.toString("utf8")));
        if (notification.packageName !== config.packageName) return invalid();
        if (notification.testNotification || notification.voidedPurchaseNotification?.productType === 1) return response();
        const purchase = notification.oneTimeProductNotification ?? notification.voidedPurchaseNotification!;
        await deps.repository.applyVerified(await verifyGooglePurchase(purchase.purchaseToken, notification.oneTimeProductNotification?.sku ?? null, config.client));
        return response();
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return invalid();
        if (error instanceof GoogleStoreVerificationError && ["PURCHASE", "AMOUNT"].includes(error.reason)) return invalid();
        return response(503);
      }
    },
  };
}

export { verifyGoogleWebhookAuthorization };
