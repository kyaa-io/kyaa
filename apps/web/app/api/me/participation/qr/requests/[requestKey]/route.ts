import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) {
  try { return await createMobileParticipationRouteHandlers().qrStatus(request, (await context.params).requestKey); }
  catch { return mobileParticipationUnavailable(); }
}
