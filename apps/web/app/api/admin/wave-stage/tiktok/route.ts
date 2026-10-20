import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveStageTikTokHandler } from "@/server/wave-stage/tiktok-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => createWaveStageTikTokHandler(createFanpageDependencies())(request);
