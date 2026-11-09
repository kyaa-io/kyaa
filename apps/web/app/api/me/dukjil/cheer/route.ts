import { createDukjilRouteHandlers } from "@/server/dukjil/dependencies";
import { dukjilFailure } from "@/server/dukjil/routes";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createDukjilRouteHandlers().cheer(request); } catch (error) { return dukjilFailure(error); } }
