import { createProofRouteHandlers } from "@/server/dukjil/dependencies";
import { proofFailure } from "@/server/dukjil/proofs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return await createProofRouteHandlers().submit(request); } catch (error) { return proofFailure(error); }
}
export async function GET(request: Request) {
  try { return await createProofRouteHandlers().mine(request); } catch (error) { return proofFailure(error); }
}
