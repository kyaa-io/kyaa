import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ handleInvitation: vi.fn() }));
vi.mock("../../../../../../server/operator/channel-operator-grants-dependencies", () => ({ createChannelOperatorGrantDependencies: () => ({ handleInvitation: state.handleInvitation }) }));
import { GET, POST } from "./route";
const CH = "10000000-0000-4000-8000-00000000000a";
beforeEach(() => { vi.clearAllMocks(); state.handleInvitation.mockResolvedValue(Response.json({ items: [] })); });
it("routes list and create to the invitation handler for the channel only", async () => {
  const list = new Request(`https://byus.test/api/admin/celebrities/${CH}/operator-invitations`);
  expect((await GET(list, { params: Promise.resolve({ id: CH }) })).status).toBe(200);
  expect(state.handleInvitation).toHaveBeenCalledWith(list, CH, null);
  const create = new Request(`https://byus.test/api/admin/celebrities/${CH}/operator-invitations`, { method: "POST", body: "{}" });
  await POST(create, { params: Promise.resolve({ id: CH }) });
  expect(state.handleInvitation).toHaveBeenLastCalledWith(create, CH, null);
});
