import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
const MEMBER = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); });

import { GET } from "./route";
const passport = "30adc677-31ab-4e68-8b2a-4a6b2af1f1d4";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
it("returns the owner's history of the passport", async () => {
  const items = [{ id: "ce4c553f-a27e-46f1-a2dc-3a8d8da1e870", kind: "start", previousTier: null, tier: "Bronze", occurredAt: "2026-11-08T04:09:30.582548+09:00" }];
  state.rpc.mockResolvedValue({ items });
  const res = await GET(new Request("https://byus.test/x"), ctx(passport));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ items });
  expect(state.rpc).toHaveBeenCalledWith("read_fan_tier_history", { p_app_user_id: MEMBER, p_passport_id: passport });
});
it("answers 404 for someone else's passport and 400 for a malformed id", async () => {
  state.rpc.mockResolvedValue(null);
  expect((await GET(new Request("https://byus.test/x"), ctx(passport))).status).toBe(404);
  expect((await GET(new Request("https://byus.test/x"), ctx("nope"))).status).toBe(400);
});
