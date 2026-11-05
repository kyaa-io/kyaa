import { createProofAdminDependencies, proofAdminRoutes } from "@/server/certification/proof-admin";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return proofAdminRoutes.voidStamp(createProofAdminDependencies())(request,await params);}
