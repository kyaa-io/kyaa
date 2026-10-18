import { createMobileStoreWebhookRouteHandlers, mobileStoreWebhookUnavailableResponse } from "@/server/mobile-store/webhook-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> { try { return await createMobileStoreWebhookRouteHandlers().google(request); } catch { return mobileStoreWebhookUnavailableResponse(); } }
