import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveDrawHandlers } from "@/server/wave/draw";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => createWaveDrawHandlers(createFanpageDependencies()).read(request);
export const PUT = (request: Request) => createWaveDrawHandlers(createFanpageDependencies()).save(request);
