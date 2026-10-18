import { createMobileSettingsRouteHandlers, mobileSettingsUnavailableResponse } from "@/server/mobile-settings/dependencies";
export const dynamic="force-dynamic";
export async function GET(r:Request,c:{params:Promise<{id:string}>}){try{return await createMobileSettingsRouteHandlers().notification(r,(await c.params).id);}catch{return mobileSettingsUnavailableResponse();}}
