import { beforeEach, expect, it, vi } from "vitest";
import { POST, GET } from "./route";
const { authorize, rpc } = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/g5/fan-operations-route-dependencies", () => ({ createFanOperationsRouteDependencies: () => ({ authorize }) }));
vi.mock("@/server/profile/account-deletion-dependencies", () => ({ createAccountDeletionDependencies: () => ({ rpc }) }));
const id = "10000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
function request(confirmation = id) {
  return new Request("https://example.test", { method: "POST", body: JSON.stringify({ confirmation, channel: "email", receivedAt: "2026-01-01T00:00:00Z" }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ role: "admin", appUserId: "actor", allowlistId: "allow" });
});
it("submits the same durable request on retry", async () => {
  rpc.mockResolvedValue({ status: "pending", completedAt: null });
  expect((await POST(request(), context)).status).toBe(202);
  expect((await POST(request(), context)).status).toBe(202);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
});
it("rejects viewers before accessing the job", async () => {
  authorize.mockResolvedValue({ role: "viewer" });
  expect((await POST(request(), context)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it("requires matching confirmation", async () => {
  expect((await POST(request(crypto.randomUUID()), context)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("returns the original completion time on duplicate submission and lookup", async () => {
  const deletion = { status: "completed", completedAt: "2026-01-01T00:10:00Z" };
  rpc.mockResolvedValue({ ...deletion, privateField: "hidden" });
  expect(await (await POST(request(), context)).json()).toEqual({ deletion });
  expect(await (await GET(new Request("https://example.test"), context)).json()).toEqual({ deletion });
});

it("records a support inquiry and returns the current processing state", async () => {
  rpc.mockResolvedValue({ status: "processing", completedAt: null });
  const response = await POST(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ confirmation: id, channel: "inquiry", receivedAt: "2026-01-01T00:00:00Z" }),
  }), context);
  expect(response.status).toBe(202);
  expect((await response.json()).deletion.status).toBe("processing");
  expect(rpc).toHaveBeenCalledWith("admin_member_withdrawal", expect.objectContaining({ p_channel: "inquiry" }));
});
