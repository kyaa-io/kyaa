import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("post-detail", request, await context.params); }
export async function DELETE(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("post-remove", request, await context.params); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) { return groupRoute("post-edit", request, await context.params); }
