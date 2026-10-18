import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileParticipationRouteHandlers().answerQuestion(request, (await context.params).id); }
  catch { return mobileParticipationUnavailable(); }
}
