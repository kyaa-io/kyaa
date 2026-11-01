import { createGroupWalletRouteHandlers } from "@/server/group-wallet/dependencies";
import { groupWalletFailure } from "@/server/group-wallet/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createGroupWalletRouteHandlers().wallet(request); } catch (error) { return groupWalletFailure(error); } }
