import { groupRaffleRoute } from "@/server/group-raffle/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; raffleId?: string }> }) { const params = await context.params; return groupRaffleRoute("recipients",request,params.id,params.raffleId,false); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string; raffleId?: string }> }) { const params = await context.params; return groupRaffleRoute("fulfill",request,params.id,params.raffleId,false); }
