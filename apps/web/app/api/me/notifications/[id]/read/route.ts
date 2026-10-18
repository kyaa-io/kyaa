import { createMobileSettingsRouteHandlers, mobileSettingsUnavailableResponse } from "@/server/mobile-settings/dependencies";
export const dynamic="force-dynamic";
export async function POST(r:Request,c:{params:Promise<{id:string}>}){try{return await createMobileSettingsRouteHandlers().markRead(r,(await c.params).id);}catch{return mobileSettingsUnavailableResponse();}}
