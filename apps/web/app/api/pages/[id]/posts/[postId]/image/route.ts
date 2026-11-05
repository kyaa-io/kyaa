import { createProofRouteHandlers } from "@/server/dukjil/dependencies";
import { proofFailure } from "@/server/dukjil/proofs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; postId: string }> }) {
  try { const { id, postId } = await context.params; return await createProofRouteHandlers().image(request, id, postId); } catch (error) { return proofFailure(error); }
}
