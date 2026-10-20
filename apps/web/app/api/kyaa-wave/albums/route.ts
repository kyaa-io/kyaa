import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveMediaHandlers } from "@/server/fanpage/wave-media-routes";
import { contentFailure } from "@/server/fan-posts/routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await createWaveMediaHandlers(createFanpageDependencies()).albums(request); }
  catch (error) { return contentFailure(error); }
}
export async function POST(request: Request) {
  try { return await createWaveMediaHandlers(createFanpageDependencies()).albums(request); }
  catch (error) { return contentFailure(error); }
}
