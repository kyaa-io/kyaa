import { createGetParticipationHandler, createPostParticipationHandler } from "../../../../../server/live-participation/routes";
import { createLiveParticipationDependencies } from "../../../../../server/live-participation/dependencies";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) { return createGetParticipationHandler(createLiveParticipationDependencies())(request, await context.params); }
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) { return createPostParticipationHandler(createLiveParticipationDependencies())(request, await context.params); }
