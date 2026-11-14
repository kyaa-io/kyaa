import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { authorizeAdmin, rpc } = vi.hoisted(() => ({ authorizeAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ authorizeAdmin, rpc }) }));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET } from "./route";

const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => { authorizeAdmin.mockReset(); rpc.mockReset(); });
it("requires admin authorization before reading participants", async () => {
  authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "required"));
  expect((await GET(new Request("http://localhost/api/admin/event-participants?event=x-mission"))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it("reads one event page for an authorized admin and disables caching", async () => {
  authorizeAdmin.mockResolvedValue({ role: "viewer", appUserId: id, allowlistId: id, email: "a@b.c" });
  rpc.mockResolvedValue({ asOf: "2026-11-14T05:00:00+00:00", total: 0, rows: [], next: null });
  const response = await GET(new Request("http://localhost/api/admin/event-participants?event=signup-raffle", { headers: { authorization: "Bearer t" } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ asOf: "2026-11-14T05:00:00+00:00", total: 0, rows: [], next: null });
});
