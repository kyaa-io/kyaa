import { bufferWebhook } from "@/server/webhook-intake/core";
import { webhookTransport } from "@/server/webhook-intake/transport";
import { createInstagramDependencies } from "../../../../server/instagram/dependencies";
import { createInstagramDeletionHandler } from "../../../../server/instagram/routes";
import { privateHeaders } from "../../../../server/instagram/pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const dependencies=createInstagramDependencies({allowDisabled:true});
    const buffered=await bufferWebhook(request,"instagram-deauthorize",(body,capture,confirmation)=>createInstagramDeletionHandler({...dependencies,repository:{...dependencies.repository,async deleteSubject(scopedId,issuedAt,confirmationHash){await capture.rpc("instagram_delete_subject",{p_scoped_id:scopedId,p_issued_at:issuedAt,p_confirmation_hash:confirmationHash});}}},confirmation)(body),webhookTransport);
    if(buffered)return buffered;
    return await createInstagramDeletionHandler(dependencies)(request);
  }
  catch { return Response.json({ error: { code: "INSTAGRAM_UNAVAILABLE" } }, { status: 503, headers: privateHeaders }); }
}
