import { withWaveAccess } from "@/server/wave/access";
import { createLiveMissionDependencies } from "../../../../../server/g3/live-mission-route-dependencies";
import { createGetLiveMissionsHandler } from "../../../../../server/g3/live-mission-route";
export const dynamic="force-dynamic";
async function waveOriginalGET(request:Request,context:{params:Promise<{slug:string}>}){try{return createGetLiveMissionsHandler(createLiveMissionDependencies())(request,await context.params);}catch{return Response.json({error:{code:"MISSION_UNAVAILABLE"}},{status:503});}}


export const GET = withWaveAccess(waveOriginalGET);
