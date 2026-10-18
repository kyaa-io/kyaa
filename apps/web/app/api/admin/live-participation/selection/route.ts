import { createAdminParticipationSelectionHandler } from "../../../../../server/live-participation/routes";
import { createLiveParticipationDependencies } from "../../../../../server/live-participation/dependencies";
export const runtime = "nodejs";
export async function POST(request: Request) { return createAdminParticipationSelectionHandler(createLiveParticipationDependencies())(request); }
