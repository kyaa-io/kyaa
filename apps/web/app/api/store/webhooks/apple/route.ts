import { bufferWebhook } from "@/server/webhook-intake/core";
import { webhookTransport } from "@/server/webhook-intake/transport";
import { createMobileStoreWebhookRouteHandlers, mobileStoreWebhookUnavailableResponse } from "@/server/mobile-store/webhook-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> { try { const buffered = await bufferWebhook(request,"store-apple",(body,capture)=>createMobileStoreWebhookRouteHandlers(capture).apple(body),webhookTransport); if(buffered)return buffered; return await createMobileStoreWebhookRouteHandlers().apple(request); } catch { return mobileStoreWebhookUnavailableResponse(); } }
