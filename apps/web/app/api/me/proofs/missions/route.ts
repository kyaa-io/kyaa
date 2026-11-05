import { createProofRouteHandlers } from "@/server/dukjil/dependencies";
import { proofFailure } from "@/server/dukjil/proofs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await createProofRouteHandlers().missions(request); } catch (error) { return proofFailure(error); }
}
