import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveFriendHandlers } from "@/server/wave/friends";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const PATCH = async (request: Request, context: { params: Promise<{ id: string }> }) => createWaveFriendHandlers(createFanpageDependencies()).resolve(request, (await context.params).id);
