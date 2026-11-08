import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createShareProofHandlers } from "@/server/share-proof/routes";
export const dynamic = "force-dynamic";
const unavailable = () => Response.json({ error: { code: "SHARE_PROOF_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store" } });
export async function GET(request: Request) { try { const { rpc, authorize } = createFanpageDependencies(); return await createShareProofHandlers({ rpc, authorize }).list(request); } catch { return unavailable(); } }
export async function POST(request: Request) { try { const { rpc, authorize } = createFanpageDependencies(); return await createShareProofHandlers({ rpc, authorize }).submit(request); } catch { return unavailable(); } }
