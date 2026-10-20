import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveDrawHandlers } from "@/server/wave/draw";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => createWaveDrawHandlers(createFanpageDependencies()).adminRead(request);
export const POST = (request: Request) => createWaveDrawHandlers(createFanpageDependencies()).execute(request);
