import {createFanEconomyRouteHandlers,fanEconomyUnavailableResponse} from "@/server/mobile-fan-economy/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{return await createFanEconomyRouteHandlers().supportRankings(request);}catch{return fanEconomyUnavailableResponse();}}
