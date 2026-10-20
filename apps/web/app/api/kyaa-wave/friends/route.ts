import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveFriendHandlers } from "@/server/wave/friends";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => createWaveFriendHandlers(createFanpageDependencies()).list(request);
export const POST = (request: Request) => createWaveFriendHandlers(createFanpageDependencies()).request(request);
