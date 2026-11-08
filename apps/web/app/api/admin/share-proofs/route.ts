import { createShareProofAdminDependencies, shareProofAdminRoutes } from "@/server/share-proof/admin";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return shareProofAdminRoutes.list(createShareProofAdminDependencies())(request); }
