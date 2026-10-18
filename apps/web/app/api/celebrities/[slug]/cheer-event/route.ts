import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createCheerEventHandlers } from "@/server/fanpage/cheer-event-routes";
import { fanpageFailure } from "@/server/fanpage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    return await createCheerEventHandlers(createFanpageDependencies()).event(request, slug);
  } catch (error) { return fanpageFailure(error); }
}
