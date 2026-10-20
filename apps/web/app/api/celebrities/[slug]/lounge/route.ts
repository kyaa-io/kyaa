import { withWaveAccess } from "@/server/wave/access";
import { fanpageJson } from "@/server/fanpage/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Pause conversations without deleting records or removing owner/admin controls.
async function waveOriginalGET() {
  return fanpageJson({ error: { code: "LOUNGE_NOT_AVAILABLE" } }, 404);
}
const waveOriginalPOST = waveOriginalGET;

export const GET = withWaveAccess(waveOriginalGET);
export const POST = withWaveAccess(waveOriginalPOST);
