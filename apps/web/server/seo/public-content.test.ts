import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { find } = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-only" }) }));
vi.mock("@/server/g4/benefit-repository", () => ({ createBenefitRepositoryFromEnvironment: () => ({ find }) }));
vi.mock("@/server/content/published-content-repository", () => ({}));
vi.mock("@/server/g3/live-event-repository", () => ({}));
vi.mock("@/server/raffle/raffle-dependencies", () => ({}));

import { loadSeoBenefit } from "./public-content";

it("reads only the anonymous benefit view and preserves missing publication", async () => {
  find.mockResolvedValue(null);
  expect(await loadSeoBenefit("gift-id", "ja")).toBeNull();
  expect(find).toHaveBeenCalledWith({ benefitId: "gift-id", locale: "en", appUserId: null, now: expect.any(Date) });
});
