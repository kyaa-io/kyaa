import { createDukjilRouteHandlers } from "@/server/dukjil/dependencies";
import { dukjilFailure } from "@/server/dukjil/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createDukjilRouteHandlers().adRewardToday(request); } catch (error) { return dukjilFailure(error); } }
export async function POST(request: Request) { try { return await createDukjilRouteHandlers().adReward(request); } catch (error) { return dukjilFailure(error); } }
