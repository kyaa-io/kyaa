import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
const MEMBER = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); });

import { GET } from "./route";
const rise = { id: "10000000-0000-4000-8000-000000000001", passportId: "30adc677-31ab-4e68-8b2a-4a6b2af1f1d4", slug: "elina", name: "엘리나", previousTier: "Bronze", tier: "Silver", occurredAt: "2026-11-08T08:28:00+09:00" };

it("records and returns the owner's unseen rises, private and uncached", async () => {
  state.rpc.mockResolvedValue({ changes: [rise] });
  const res = await GET(new Request("https://byus.test/api/me/tier-changes?locale=en", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ changes: [rise] });
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(state.rpc).toHaveBeenCalledWith("observe_fan_tiers", { p_app_user_id: MEMBER, p_locale: "en" });
});
it("answers an empty list for a fan without passports and 401 without a session", async () => {
  state.rpc.mockResolvedValue({ changes: [] });
  expect(await (await GET(new Request("https://byus.test/api/me/tier-changes"))).json()).toEqual({ changes: [] });
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED" as never, 401, "no session"));
  expect((await GET(new Request("https://byus.test/api/me/tier-changes"))).status).toBe(401);
});
it("does not pass a database shape it does not know", async () => {
  state.rpc.mockResolvedValue({ changes: [{ ...rise, tier: "Ruby" }] });
  expect((await GET(new Request("https://byus.test/api/me/tier-changes"))).status).toBe(503);
});
