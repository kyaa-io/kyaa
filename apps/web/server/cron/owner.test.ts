import { afterEach, expect, it, vi } from "vitest";
import { cronOwner, cronOwnerResponse } from "./owner";
afterEach(() => vi.unstubAllEnvs());
const secret = "s".repeat(32);
const request = (aws = false, token = secret) => new Request("https://example.test/cron", { headers: { authorization: `Bearer ${token}`, ...(aws ? { "x-byus-scheduler": "aws" } : {}) } });
it("preserves the existing Vercel owner by default and rejects bad configuration", () => {
  vi.stubEnv("CRON_OWNER", undefined); vi.stubEnv("CRON_SECRET", secret);
  expect(cronOwner()).toBe("vercel"); expect(cronOwnerResponse(request())).toBeNull(); expect(cronOwnerResponse(request(true))?.status).toBe(204);
  vi.stubEnv("CRON_OWNER", "both"); expect(() => cronOwner()).toThrow();
});
it("permits exactly one scheduler and leaves unauthorized requests to the original 401 check", () => {
  vi.stubEnv("CRON_OWNER", "aws"); vi.stubEnv("CRON_SECRET", secret);
  expect(cronOwnerResponse(request(true))).toBeNull(); expect(cronOwnerResponse(request())?.status).toBe(204);
  expect(cronOwnerResponse(request(false, "wrong"))).toBeNull();
  vi.stubEnv("CRON_OWNER", "disabled"); expect(cronOwnerResponse(request(true))?.status).toBe(204); expect(cronOwnerResponse(request())?.status).toBe(204);
});
