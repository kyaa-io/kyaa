import { withWaveAccess } from "@/server/wave/access";
import { officialMediaRoute } from "@/server/media/official-media-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function waveOriginalGET(request: Request, { params }: { params: Promise<{ slug: string }> }) { return officialMediaRoute(request, (await params).slug); }

export const GET = withWaveAccess(waveOriginalGET);
