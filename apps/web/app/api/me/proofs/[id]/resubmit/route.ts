import { createProofRouteHandlers } from "@/server/dukjil/dependencies";
import { proofFailure } from "@/server/dukjil/proofs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createProofRouteHandlers().resubmit(request, (await context.params).id); } catch (error) { return proofFailure(error); }
}
