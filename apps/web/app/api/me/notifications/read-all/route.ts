import {
  createMobileSettingsRouteHandlers,
  mobileSettingsUnavailableResponse,
} from "@/server/mobile-settings/dependencies";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    return await createMobileSettingsRouteHandlers().markAllRead(r);
  } catch {
    return mobileSettingsUnavailableResponse();
  }
}
