import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanpageHandlers, fanpageFailure } from "@/server/fanpage/routes";

type Context = { params: Promise<{ id: string }> };

async function waveOriginalPUT(request: Request, context: Context) {
  try {
    return await createFanpageHandlers(createFanpageDependencies()).reactToComment(
      request,
      (await context.params).id,
    );
  } catch (error) {
    return fanpageFailure(error);
  }
}

export const PUT = withWaveAccess(waveOriginalPUT);
