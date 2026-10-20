import { withWaveAccess } from "@/server/wave/access";
import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileContentRouteHandlers().clip(request, (await context.params).id); }
  catch { return mobileContentUnavailable(); }
}
const waveOriginalGET = handle;
const waveOriginalDELETE = handle;

export const GET = withWaveAccess(waveOriginalGET);
export const DELETE = withWaveAccess(waveOriginalDELETE);
