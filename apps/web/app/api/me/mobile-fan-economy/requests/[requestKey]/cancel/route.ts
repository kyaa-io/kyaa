import {createFanEconomyRouteHandlers,fanEconomyUnavailableResponse}from "@/server/mobile-fan-economy/dependencies";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{requestKey:string}>}){try{return await createFanEconomyRouteHandlers().cancel(request,(await context.params).requestKey);}catch{return fanEconomyUnavailableResponse();}}
