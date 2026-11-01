import { createGroupWalletRouteHandlers } from "@/server/group-wallet/dependencies";
import { groupWalletFailure } from "@/server/group-wallet/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) { try { return await createGroupWalletRouteHandlers().request(request, (await context.params).requestKey); } catch (error) { return groupWalletFailure(error); } }
