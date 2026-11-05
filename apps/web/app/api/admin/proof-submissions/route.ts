import { createProofAdminDependencies, proofAdminRoutes } from "@/server/certification/proof-admin";
export async function GET(request:Request){return proofAdminRoutes.queue(createProofAdminDependencies())(request);}
