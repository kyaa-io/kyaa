import { createPostParticipationUploadHandler } from "../../../../../../../server/live-participation/routes";
import { createLiveParticipationDependencies } from "../../../../../../../server/live-participation/dependencies";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ slug: string; missionId: string }> }) { return createPostParticipationUploadHandler(createLiveParticipationDependencies())(request, await context.params); }
