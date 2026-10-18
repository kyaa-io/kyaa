import { createOnboardingRouteHandlers } from "@/server/profile/onboarding-dependencies";
import { profileUnavailableResponse } from "@/server/profile/profile-route-dependencies";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try { return await createOnboardingRouteHandlers().availability(request); }
  catch { return profileUnavailableResponse(); }
}
