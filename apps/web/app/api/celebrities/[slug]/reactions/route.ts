import { withWaveAccess } from "@/server/wave/access";
import { createReactionRouteDependencies } from "../../../../../server/reaction/reaction-route-dependencies";
import { createGetReactionHandler, createPostReactionHandler } from "../../../../../server/reaction/reaction-route";

export const dynamic = "force-dynamic";

async function waveOriginalPOST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  try {
    const { slug } = await context.params;
    return createPostReactionHandler(createReactionRouteDependencies())(request, { celebritySlug: slug });
  } catch {
    return Response.json({ error: { code: "REACTION_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  try {
    const { slug } = await context.params;
    return createGetReactionHandler(createReactionRouteDependencies())(request, { celebritySlug: slug });
  } catch {
    return Response.json({ error: { code: "REACTION_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export const POST = withWaveAccess(waveOriginalPOST);
export const GET = withWaveAccess(waveOriginalGET);
