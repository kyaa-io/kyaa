import { createMobileSettingsRouteHandlers, mobileSettingsUnavailableResponse } from "@/server/mobile-settings/dependencies";
export const dynamic="force-dynamic";
export async function POST(r:Request){try{return await createMobileSettingsRouteHandlers().registerInstallation(r);}catch{return mobileSettingsUnavailableResponse();}}
