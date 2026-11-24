import { createDukjilRouteHandlers } from "@/server/dukjil/dependencies";
import { dukjilFailure } from "@/server/dukjil/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createDukjilRouteHandlers().attendanceList(request); } catch (error) { return dukjilFailure(error); } }
export async function POST(request: Request) { try { return await createDukjilRouteHandlers().attendAll(request); } catch (error) { return dukjilFailure(error); } }
