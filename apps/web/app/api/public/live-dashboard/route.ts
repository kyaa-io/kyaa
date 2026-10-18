import { createGetPublicLiveDashboardHandler } from "../../../../server/live-participation/routes";
import { createLiveParticipationDependencies } from "../../../../server/live-participation/dependencies";
export const runtime = "nodejs";
export async function GET() { return createGetPublicLiveDashboardHandler(createLiveParticipationDependencies())(); }
