import { createParticipationAdminRouteHandlers, participationAdminUnavailable } from "@/server/mobile-participation/admin-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) { try { return await createParticipationAdminRouteHandlers().confirmQr(request, (await context.params).requestId); } catch { return participationAdminUnavailable(); } }
