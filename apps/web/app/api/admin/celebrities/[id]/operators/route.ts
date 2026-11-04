import { createChannelOperatorGrantDependencies } from "../../../../../../server/operator/channel-operator-grants-dependencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return createChannelOperatorGrantDependencies().handle(request, (await context.params).id, null);
}
export async function POST(request: Request, context: Context) {
  return createChannelOperatorGrantDependencies().handle(request, (await context.params).id, null);
}
