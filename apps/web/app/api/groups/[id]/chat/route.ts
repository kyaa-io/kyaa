import { groupChatRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return groupChatRoute(request, (await context.params).id); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return groupChatRoute(request, (await context.params).id); }
