import { bufferWebhook } from "@/server/webhook-intake/core";
import { webhookTransport } from "@/server/webhook-intake/transport";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { createSolapiWebhookHandler } from "@/server/notification/solapi-webhook-route";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const env = loadServerEnv();
    const buffered = await bufferWebhook(request,"solapi",(body,capture)=>createSolapiWebhookHandler({secret:env.SOLAPI_WEBHOOK_SECRET,client:capture})(body),webhookTransport);
    if(buffered)return buffered;
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return createSolapiWebhookHandler({ secret: env.SOLAPI_WEBHOOK_SECRET, client })(request);
  } catch { return Response.json({ error: { code: "SOLAPI_WEBHOOK_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
