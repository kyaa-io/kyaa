import { createShareProofAdminDependencies, shareProofAdminRoutes } from "@/server/share-proof/admin";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return shareProofAdminRoutes.revoke(createShareProofAdminDependencies())(request, await params); }
