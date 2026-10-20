import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveStagePresentationHandler } from "@/server/wave-stage/presentation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => createWaveStagePresentationHandler(createFanpageDependencies())(request);
