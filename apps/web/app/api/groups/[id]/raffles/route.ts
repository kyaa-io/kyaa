import { groupRaffleRoute } from "@/server/group-raffle/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; raffleId?: string }> }) { const params = await context.params; return groupRaffleRoute("list",request,params.id,params.raffleId,false); }
export async function POST(request: Request, context: { params: Promise<{ id: string; raffleId?: string }> }) { const params = await context.params; return groupRaffleRoute("create",request,params.id,params.raffleId,false); }
