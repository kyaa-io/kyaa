import { createProofRouteHandlers } from "@/server/dukjil/dependencies";
import { proofFailure } from "@/server/dukjil/proofs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createProofRouteHandlers().board(request, (await context.params).id); } catch (error) { return proofFailure(error); }
}
