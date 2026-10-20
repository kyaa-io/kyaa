import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveStageHandlers } from "@/server/wave-stage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = (request: Request) => createWaveStageHandlers(createFanpageDependencies()).draw(request);
