import { bufferWebhook } from "@/server/webhook-intake/core";
import { webhookTransport } from "@/server/webhook-intake/transport";
import {
  AppleLifecycleRepository, appleLifecycleEnabled, createAppleLifecycleRepository,
} from "../../../../../server/auth/apple-notifications/apple-lifecycle";
import { receiveAppleNotification } from "../../../../../server/auth/apple-notifications/notification-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    if (!appleLifecycleEnabled()) throw new Error("Apple notifications are not enabled");
    const buffered=await bufferWebhook(request,"apple-account",(body,capture)=>receiveAppleNotification(body,{repository:new AppleLifecycleRepository(capture)}),webhookTransport);
    if(buffered)return buffered;
    return await receiveAppleNotification(request, { repository: createAppleLifecycleRepository() });
  } catch {
    return Response.json({ error: { code: "APPLE_NOTIFICATION_UNAVAILABLE" } }, {
      status: 503, headers: { "cache-control": "no-store" },
    });
  }
}
