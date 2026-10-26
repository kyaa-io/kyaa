import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGggiEventHandlers } from "@/server/fanpage/gggi-event-routes";
import { fanpageFailure } from "@/server/fanpage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return await createGggiEventHandlers(createFanpageDependencies()).admin(request); }
  catch (error) { return fanpageFailure(error); }
}
