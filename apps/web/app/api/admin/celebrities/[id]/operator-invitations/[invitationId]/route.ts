import { createChannelOperatorGrantDependencies } from "../../../../../../../server/operator/channel-operator-grants-dependencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; invitationId: string }> }) {
  const { id, invitationId } = await context.params;
  return createChannelOperatorGrantDependencies().handleInvitation(request, id, invitationId);
}
