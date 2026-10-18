import {createFanEconomyRouteHandlers,fanEconomyUnavailableResponse} from "@/server/mobile-fan-economy/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request, context: {params:Promise<{celebritySlug:string}>}){try{return await createFanEconomyRouteHandlers().supportFanRankings(request, (await context.params).celebritySlug);}catch{return fanEconomyUnavailableResponse();}}
