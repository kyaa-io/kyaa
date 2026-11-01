import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("bookmark", request, await context.params); }
export async function DELETE(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("unbookmark", request, await context.params); }
