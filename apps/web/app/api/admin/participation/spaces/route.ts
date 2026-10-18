import { createParticipationAdminRouteHandlers, participationAdminUnavailable } from "@/server/mobile-participation/admin-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createParticipationAdminRouteHandlers().upsertSpace(request); } catch { return participationAdminUnavailable(); } }
