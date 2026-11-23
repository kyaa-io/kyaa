import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ handleInvitation: vi.fn(async () => Response.json({ item: { status: "cancelled" } })) }));
vi.mock("../../../../../../../server/operator/channel-operator-grants-dependencies", () => ({ createChannelOperatorGrantDependencies: () => ({ handleInvitation: state.handleInvitation }) }));
import { DELETE } from "./route";
const CH = "10000000-0000-4000-8000-00000000000a";
const INVITE = "60000000-0000-4000-8000-000000000001";
it("routes cancel to the invitation handler with the channel and invitation ids", async () => {
  const request = new Request(`https://byus.test/api/admin/celebrities/${CH}/operator-invitations/${INVITE}`, { method: "DELETE" });
  expect((await DELETE(request, { params: Promise.resolve({ id: CH, invitationId: INVITE }) })).status).toBe(200);
  expect(state.handleInvitation).toHaveBeenCalledWith(request, CH, INVITE);
});
