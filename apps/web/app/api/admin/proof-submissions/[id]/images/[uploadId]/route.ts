import { createProofAdminDependencies, proofAdminRoutes } from "@/server/certification/proof-admin";
export async function GET(request:Request,{params}:{params:Promise<{id:string;uploadId:string}>}){return proofAdminRoutes.imageLink(createProofAdminDependencies())(request,await params);}
