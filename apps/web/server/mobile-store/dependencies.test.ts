import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("../config/env", () => ({ loadServerEnv: () => ({
  SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
  PRIVY_APP_ID: "fixture-app", PRIVY_APP_SECRET: "fixture-secret", PRIVY_APP_ENVIRONMENT: "production",
}) }));
vi.mock("../auth/privy-node-verifier", () => ({ createPrivyNodeAccessVerifier: () => ({}) }));
vi.mock("../fan-auth/supabase-fan-auth-repository", () => ({ createSupabaseFanAuthRepository: () => ({}) }));
vi.mock("../fan-auth/fan-auth-gate", () => ({ authorizeFanRequest: async () => ({
  appUserId: "57000000-0000-4000-8000-000000000001",
}) }));

import { createMobileStoreRouteHandlers } from "./dependencies";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("returns an unconfigured product catalog without payment provider credentials", async () => {
  for (const key of ["APPLE_STORE_ROOT_CERTIFICATES_PEM", "APPLE_STORE_BUNDLE_ID", "APPLE_STORE_APP_APPLE_ID",
    "GOOGLE_PLAY_PACKAGE_NAME", "GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY"]) {
    vi.stubEnv(key, undefined);
  }
  rpc.mockResolvedValue({ data: { products: [] }, error: null });
  const response = await createMobileStoreRouteHandlers().products(new Request(
    "https://kyaa.io/api/me/store/products?store=apple&celebritySlug=creator",
  ));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ products: [] });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("mobile_store_list_products", {
    p_app_user_id: "57000000-0000-4000-8000-000000000001", p_store: "apple", p_celebrity_slug: "creator",
  });
});
