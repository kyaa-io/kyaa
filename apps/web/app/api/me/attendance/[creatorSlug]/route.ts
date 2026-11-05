import { createDukjilRouteHandlers } from "@/server/dukjil/dependencies";
import { dukjilFailure } from "@/server/dukjil/routes";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ creatorSlug: string }> }) { try { return await createDukjilRouteHandlers().attend(request, (await context.params).creatorSlug); } catch (error) { return dukjilFailure(error); } }
