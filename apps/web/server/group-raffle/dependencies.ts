import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupRaffleHandler, type GroupRaffleOperation } from "./routes";
export async function groupRaffleRoute(operation: GroupRaffleOperation, request: Request, pageId: string, raffleId?: string, platformAdmin = false) {
 if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUP_RAFFLE_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
 try { return await createGroupRaffleHandler(createFanpageDependencies())(operation, request, pageId, raffleId, platformAdmin); } catch { return Response.json({ error: { code: "GROUP_WALLET_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store" } }); }
}
