import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";

export async function GET(
  request: Request,
  context: { params: Promise<{ requestKey: string }> },
) {
  try {
    return await createMobileParticipationRouteHandlers().postRequest(
      request,
      (await context.params).requestKey,
    );
  } catch {
    return mobileParticipationUnavailable();
  }
}
