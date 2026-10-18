import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanpageHandlers, fanpageFailure } from "@/server/fanpage/routes";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    return await createFanpageHandlers(createFanpageDependencies()).reactToComment(
      request,
      (await context.params).id,
    );
  } catch (error) {
    return fanpageFailure(error);
  }
}
