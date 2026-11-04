import { participationRoute } from "@/server/schedules/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return participationRoute("operator-schedules", request, await context.params); }
export async function POST(request: Request, context: Context) { return participationRoute("operator-schedules", request, await context.params); }
