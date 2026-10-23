import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createPhotocardClaimHandlers } from "@/server/photocards/claims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return createPhotocardClaimHandlers(createFanpageDependencies()).get(request, (await context.params).id);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return createPhotocardClaimHandlers(createFanpageDependencies()).claim(request, (await context.params).id);
}
