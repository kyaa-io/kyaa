import { withWaveAccess } from "@/server/wave/access";
import {
  createQuizAttemptHandlerDependencies,
  quizAttemptUnavailableResponse,
} from "../../../../../../server/g2/quiz-attempt-route-dependencies";
import { createStartQuizAttemptHandler } from "../../../../../../server/g2/quiz-attempt-route";

export const dynamic = "force-dynamic";

async function waveOriginalPOST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const dependencies = createQuizAttemptHandlerDependencies();
    const { slug } = await context.params;
    return createStartQuizAttemptHandler(dependencies)(request, { celebritySlug: slug });
  } catch {
    return quizAttemptUnavailableResponse();
  }
}

export const POST = withWaveAccess(waveOriginalPOST);
