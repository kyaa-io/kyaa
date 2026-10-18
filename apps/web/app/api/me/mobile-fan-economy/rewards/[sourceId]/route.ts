import {createFanEconomyRouteHandlers,fanEconomyUnavailableResponse} from "@/server/mobile-fan-economy/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request, context: {params:Promise<{sourceId:string}>}){try{return await createFanEconomyRouteHandlers().reward(request, (await context.params).sourceId);}catch{return fanEconomyUnavailableResponse();}}
