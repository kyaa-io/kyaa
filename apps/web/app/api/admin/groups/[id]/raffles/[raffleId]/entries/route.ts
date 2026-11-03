import { groupRaffleRoute } from "@/server/group-raffle/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string; raffleId?: string }> }) { const params = await context.params; return groupRaffleRoute("enter",request,params.id,params.raffleId,true); }
