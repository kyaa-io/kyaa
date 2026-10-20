import { withWaveAccess } from "@/server/wave/access";
import { collectibleUnavailableResponse, createCollectibleRouteDependencies, createGetCollectibleHandler, createPostCollectibleHandler } from "../../../../../server/collectible/collectible-route";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };

async function waveOriginalGET(request: Request, context: RouteContext): Promise<Response> {
  try { const deps = createCollectibleRouteDependencies(); const { slug } = await context.params; return createGetCollectibleHandler(deps)(request, { slug }); }
  catch { return collectibleUnavailableResponse(); }
}

async function waveOriginalPOST(request: Request, context: RouteContext): Promise<Response> {
  try { const deps = createCollectibleRouteDependencies(); const { slug } = await context.params; return createPostCollectibleHandler(deps)(request, { slug }); }
  catch { return collectibleUnavailableResponse(); }
}

export const GET = withWaveAccess(waveOriginalGET);
export const POST = withWaveAccess(waveOriginalPOST);
