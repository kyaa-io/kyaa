import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createCheerEventHandlers } from "@/server/fanpage/cheer-event-routes";
import { fanpageFailure } from "@/server/fanpage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return await createCheerEventHandlers(createFanpageDependencies()).participants(request, id);
  } catch (error) { return fanpageFailure(error); }
}
