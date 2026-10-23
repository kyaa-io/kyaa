import { pendingReceipt } from "@/server/webhook-intake/pending-receipt";
import { createInstagramDependencies } from "../../../../server/instagram/dependencies";
import { createInstagramDeletionStatusHandler } from "../../../../server/instagram/routes";
import { instagramRequestLocale, unavailablePage } from "../../../../server/instagram/pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function handle(request: Request) {
  let response: Response;
  try { response = await createInstagramDeletionStatusHandler(createInstagramDependencies({ allowDisabled: true }))(request); }
  catch { response = unavailablePage(instagramRequestLocale(request)); }
  if (response.status !== 404 && response.status !== 503) return response;
  return await pendingReceipt(request) ?? response;
}
export const GET = handle;
