import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(async () => "receipt") }));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ rpc, authorize: async () => ({ appUserId: "session-owner" }) }),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("keeps the held event unavailable", async () => {
  vi.stubEnv("DONATION_VOTE_ENABLED", "false");
  expect((await GET(new Request("https://example.test"))).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});
it("uses the authenticated owner and preserves the retry key", async () => {
  vi.stubEnv("DONATION_VOTE_ENABLED", "true");
  const requestId = crypto.randomUUID();
  const creatorId = crypto.randomUUID();
  const response = await POST(new Request("https://example.test", {
    method: "POST", body: JSON.stringify({ requestId, creatorId, quantity: 7, owner: "other" }),
  }));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("cast_donation_vote", {
    p_user: "session-owner", p_event: "new-year-2027", p_request: requestId, p_creator: creatorId, p_quantity: 7,
  });
});
