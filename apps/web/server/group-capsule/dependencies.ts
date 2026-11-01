import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createCapsuleHandler, type CapsuleOperation } from "./routes";
export async function capsuleRoute(operation: CapsuleOperation, request: Request, campaignId?: string, requestKey?: string) {
 if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "CAPSULE_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
 return createCapsuleHandler(createFanpageDependencies())(operation, request, campaignId, requestKey);
}
