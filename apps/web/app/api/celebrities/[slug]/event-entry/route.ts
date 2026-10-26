import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGggiEventHandlers } from "@/server/fanpage/gggi-event-routes";
import { fanpageFailure } from "@/server/fanpage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function handle(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    return await createGggiEventHandlers(createFanpageDependencies()).event(request, (await context.params).slug);
  } catch (error) { return fanpageFailure(error); }
}
export const GET = handle;
export const POST = handle;
