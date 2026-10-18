import { createMobileSettingsRouteHandlers, mobileSettingsUnavailableResponse } from "@/server/mobile-settings/dependencies";
export const dynamic="force-dynamic";
export async function GET(r:Request){try{return await createMobileSettingsRouteHandlers().getSettings(r);}catch{return mobileSettingsUnavailableResponse();}}
export async function PATCH(r:Request){try{return await createMobileSettingsRouteHandlers().patchSettings(r);}catch{return mobileSettingsUnavailableResponse();}}
