import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("messages", request, await context.params); }
export async function POST(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("message", request, await context.params); }
