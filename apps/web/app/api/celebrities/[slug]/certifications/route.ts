import { withWaveAccess } from "@/server/wave/access";
import { createCertificationDependencies } from "@/server/certification/certification-dependencies";
import { certificationRoutes } from "@/server/certification/certification-routes";
export const dynamic="force-dynamic";
async function waveOriginalGET(request:Request,{params}:{params:Promise<{slug:string}>}){return certificationRoutes.publicList(createCertificationDependencies())(request,await params);}

export const GET = withWaveAccess(waveOriginalGET);
