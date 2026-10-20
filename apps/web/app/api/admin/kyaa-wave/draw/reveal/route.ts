import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveDrawHandlers } from "@/server/wave/draw";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = (request: Request) => createWaveDrawHandlers(createFanpageDependencies()).reveal(request);
