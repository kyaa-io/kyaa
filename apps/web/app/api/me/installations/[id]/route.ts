import { createMobileSettingsRouteHandlers, mobileSettingsUnavailableResponse } from "@/server/mobile-settings/dependencies";
export const dynamic="force-dynamic";
export async function GET(r:Request,c:{params:Promise<{id:string}>}){try{return await createMobileSettingsRouteHandlers().getInstallation(r,(await c.params).id);}catch{return mobileSettingsUnavailableResponse();}}
export async function DELETE(r:Request,c:{params:Promise<{id:string}>}){try{return await createMobileSettingsRouteHandlers().disableInstallation(r,(await c.params).id);}catch{return mobileSettingsUnavailableResponse();}}
