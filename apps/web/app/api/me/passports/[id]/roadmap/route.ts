import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createRoadmapHandler } from "@/server/dukjil/roadmap";
import { dukjilFailure } from "@/server/dukjil/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { rpc, authorize } = createFanpageDependencies();
    return await createRoadmapHandler({ rpc, authorize }).roadmap(request, (await context.params).id);
  } catch (error) { return dukjilFailure(error); }
}
