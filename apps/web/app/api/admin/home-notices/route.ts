import { createHomeNoticeAdminDependencies } from "../../../../server/home-notice/home-notice-dependencies";
import { createHomeNoticeAdminHandlers } from "../../../../server/home-notice/home-notice-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = () => createHomeNoticeAdminHandlers(createHomeNoticeAdminDependencies);
export async function GET(request: Request) { return handlers().GET(request); }
export async function POST(request: Request) { return handlers().POST(request); }
