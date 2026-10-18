import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await createMobileParticipationRouteHandlers().catalog(request);
  } catch {
    return mobileParticipationUnavailable();
  }
}
