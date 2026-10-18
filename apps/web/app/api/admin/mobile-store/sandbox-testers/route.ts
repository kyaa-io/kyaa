import { createMobileStoreAdminRouteHandlers, mobileStoreAdminUnavailable } from "@/server/mobile-store/admin-dependencies";
export async function POST(request:Request){try{return await createMobileStoreAdminRouteHandlers().setSandboxTester(request);}catch{return mobileStoreAdminUnavailable();}}
