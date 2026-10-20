import { withWaveAccess } from "@/server/wave/access";
import { createRaffleDependencies } from "@/server/raffle/raffle-dependencies";
import { createGetRafflesHandler } from "@/server/raffle/raffle-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function waveOriginalGET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  return createGetRafflesHandler(createRaffleDependencies())(request, {
    celebritySlug: slug,
  });
}

export const GET = withWaveAccess(waveOriginalGET);
