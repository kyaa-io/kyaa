import { groupGiftRoute } from "@/server/group-gifts/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ applicationId: string }> }) { return groupGiftRoute("admin-detail", request, await context.params); }
export async function PATCH(request: Request, context: { params: Promise<{ applicationId: string }> }) { return groupGiftRoute("review", request, await context.params); }
