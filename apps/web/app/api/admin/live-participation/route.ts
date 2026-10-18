import { createAdminParticipationHandler } from "../../../../server/live-participation/routes";
import { createLiveParticipationDependencies } from "../../../../server/live-participation/dependencies";
export const runtime = "nodejs";
export async function GET(request: Request) { return createAdminParticipationHandler(createLiveParticipationDependencies())(request); }
export async function POST(request: Request) { return createAdminParticipationHandler(createLiveParticipationDependencies())(request); }
