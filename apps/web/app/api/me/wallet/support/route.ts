import { createGroupWalletRouteHandlers } from "@/server/group-wallet/dependencies";
import { groupWalletFailure } from "@/server/group-wallet/routes";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createGroupWalletRouteHandlers().support(request); } catch (error) { return groupWalletFailure(error); } }
