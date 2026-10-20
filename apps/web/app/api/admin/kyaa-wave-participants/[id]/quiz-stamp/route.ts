import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveQuizStampHandler } from "@/server/wave/quiz-stamp";
import { contentFailure } from "@/server/fan-posts/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await createWaveQuizStampHandler(createFanpageDependencies())(request, (await context.params).id);
  } catch (error) { return contentFailure(error); }
}
