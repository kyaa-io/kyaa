import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveFriendHandlers } from "@/server/wave/friends";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => createWaveFriendHandlers(createFanpageDependencies()).messages(request, (await context.params).id);
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) => createWaveFriendHandlers(createFanpageDependencies()).send(request, (await context.params).id);
