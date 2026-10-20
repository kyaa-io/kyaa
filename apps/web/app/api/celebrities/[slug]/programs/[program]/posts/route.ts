import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { contentFailure } from "@/server/fan-posts/routes";
import { createProgramHandlers } from "@/server/fanpage/program-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ slug: string; program: string }> }) {
  try {
    const { slug, program } = await context.params;
    return await createProgramHandlers(createFanpageDependencies()).posts(request, slug, program);
  } catch (error) { return contentFailure(error); }
}
export const GET = handle;
export const POST = handle;
