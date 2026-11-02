import { groupGiftRoute } from "@/server/group-gifts/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return groupGiftRoute("list", request, await context.params); }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return groupGiftRoute("submit", request, await context.params); }
