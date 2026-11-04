import { createChannelOperatorGrantDependencies } from "../../../../../../../server/operator/channel-operator-grants-dependencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; grantId: string }> }) {
  const { id, grantId } = await context.params;
  return createChannelOperatorGrantDependencies().handle(request, id, grantId);
}
