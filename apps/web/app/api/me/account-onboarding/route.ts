import { createOnboardingRouteHandlers } from "@/server/profile/onboarding-dependencies";
import { profileUnavailableResponse } from "@/server/profile/profile-route-dependencies";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try { return await createOnboardingRouteHandlers().get(request); }
  catch { return profileUnavailableResponse(); }
}

export async function POST(request: Request): Promise<Response> {
  try { return await createOnboardingRouteHandlers().complete(request); }
  catch { return profileUnavailableResponse(); }
}
