import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("join", request, await context.params); }
export async function DELETE(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("leave", request, await context.params); }
