import { groupGiftRoute } from "@/server/group-gifts/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{}> }) { return groupGiftRoute("admin-list", request, await context.params); }
