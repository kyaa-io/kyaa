import { createHomeNoticeAdminDependencies } from "../../../../../../server/home-notice/home-notice-dependencies";
import { createHomeNoticeAdminHandlers } from "../../../../../../server/home-notice/home-notice-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return createHomeNoticeAdminHandlers(createHomeNoticeAdminDependencies).uploadAsset(request, context);
}
