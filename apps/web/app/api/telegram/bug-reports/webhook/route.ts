import { bufferWebhook } from "@/server/webhook-intake/core";
import { webhookTransport } from "@/server/webhook-intake/transport";
import { createTelegramBugReportRepository } from "@/server/telegram/bug-report-repository";
import { createTelegramBugReportDependencies } from "@/server/telegram/bug-report-dependencies";
import { createTelegramBugReportWebhookHandler } from "@/server/telegram/bug-report-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const dependencies = createTelegramBugReportDependencies();
    const buffered=await bufferWebhook(request,"telegram",(body,capture)=>createTelegramBugReportWebhookHandler({secret:dependencies.webhookSecret,repository:createTelegramBugReportRepository(capture)})(body),webhookTransport);
    if(buffered)return buffered;
    return createTelegramBugReportWebhookHandler({
      secret: dependencies.webhookSecret,
      repository: dependencies.repository,
    })(request);
  } catch {
    return Response.json(
      { error: { code: "TELEGRAM_WEBHOOK_UNAVAILABLE" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
