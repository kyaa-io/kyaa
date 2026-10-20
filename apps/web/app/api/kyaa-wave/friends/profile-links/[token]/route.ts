import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveFriendHandlers } from "@/server/wave/friends";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ token: string }> }) => createWaveFriendHandlers(createFanpageDependencies()).profile(request, (await context.params).token);
