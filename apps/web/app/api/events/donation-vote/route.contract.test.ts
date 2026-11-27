import { afterEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET, POST } from "./route";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(async (): Promise<unknown> => "receipt") }));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ rpc, authorize: async (header: string | null) => {
    if (!header) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Missing session");
    return { appUserId: "session-owner" };
  } }),
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
    method: "POST", headers: { authorization: "Bearer session" }, body: JSON.stringify({ requestId, creatorId, quantity: 7, owner: "other" }),
  }));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("cast_donation_vote", {
    p_user: "session-owner", p_event: "new-year-2027", p_request: requestId, p_creator: creatorId, p_quantity: 7,
  });
});

it("exposes only the public ranking and dates when no credential is supplied", async () => {
  vi.stubEnv("DONATION_VOTE_ENABLED", "true");
  const row = { id: "candidate", slug: "example", fandom_name: null, votes: 11 };
  rpc.mockResolvedValueOnce({ startsAt: null, endsAt: "2027-01-10", remaining: 500,
    ranking: [{ ...row, owner_id: "private" }] });
  const response = await GET(new Request("https://example.test"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ startsAt: null, endsAt: "2027-01-10", ranking: [row] });
  expect(rpc).toHaveBeenCalledWith("donation_vote_state", { p_user: null, p_event: "new-year-2027" });
});

it("rejects anonymous votes before calling the database", async () => {
  vi.stubEnv("DONATION_VOTE_ENABLED", "true");
  expect((await POST(new Request("https://example.test", { method: "POST" }))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
