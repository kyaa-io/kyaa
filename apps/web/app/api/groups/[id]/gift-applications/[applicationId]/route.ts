import { groupGiftRoute } from "@/server/group-gifts/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; applicationId: string }> }) { return groupGiftRoute("detail", request, await context.params); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string; applicationId: string }> }) { return groupGiftRoute("revise", request, await context.params); }
