import { createMobileSettingsRouteHandlers, mobileSettingsUnavailableResponse } from "@/server/mobile-settings/dependencies";
export const dynamic="force-dynamic";
export async function GET(r:Request){try{return await createMobileSettingsRouteHandlers().notifications(r);}catch{return mobileSettingsUnavailableResponse();}}
