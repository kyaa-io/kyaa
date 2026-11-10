import { afterEach, describe, expect, it, vi } from "vitest";

// Every route that spends tickets must refuse before it touches any dependency while the data environment is not "development" (production preview).
const dependencyTouched = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/server/wave/access", () => ({ withWaveAccess: (handler: unknown) => handler }));
vi.mock("../../server/g4/benefit-route-dependencies", () => ({
  createBenefitRouteDependencies: () => { dependencyTouched(); throw new Error("must not run in preview"); },
  benefitsUnavailableResponse: () => new Response(null, { status: 503 }),
}));
vi.mock("../../server/g4/benefit-route", () => ({ createPostBenefitEntryHandler: () => { dependencyTouched(); throw new Error("must not run in preview"); } }));

const routes = [
  ["benefit entry", () => import("./benefits/[id]/entries/route"), (route: { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }) => route.POST(new Request("https://kyaa.test/api/benefits/x/entries", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "x" }) })],
  ["mobile entry", () => import("./me/mobile-benefits/entries/route"), (route: { POST: (request: Request) => Promise<Response> }) => route.POST(new Request("https://kyaa.test/api/me/mobile-benefits/entries", { method: "POST", body: "{}" }))],
  ["mobile instant draw", () => import("./me/mobile-benefits/instant-draws/route"), (route: { POST: (request: Request) => Promise<Response> }) => route.POST(new Request("https://kyaa.test/api/me/mobile-benefits/instant-draws", { method: "POST", body: "{}" }))],
] as const;

describe("lucky draw writes in the production preview", () => {
  afterEach(() => { vi.unstubAllEnvs(); dependencyTouched.mockClear(); });
  for (const environment of ["production", "", "staging"]) {
    for (const [name, load, call] of routes) {
      it(`${name} answers 403 LUCKY_DRAW_PREVIEW when BYUS_DATA_ENVIRONMENT is "${environment}"`, async () => {
        vi.stubEnv("BYUS_DATA_ENVIRONMENT", environment);
        const response = await (call as (route: unknown) => Promise<Response>)(await load());
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: { code: "LUCKY_DRAW_PREVIEW" } });
        expect(dependencyTouched).not.toHaveBeenCalled();
      });
    }
  }
  it("benefit entry reaches its handler (no preview) in the development data environment", async () => {
    vi.stubEnv("BYUS_DATA_ENVIRONMENT", "development");
    const route = await import("./benefits/[id]/entries/route");
    const response = await route.POST(new Request("https://kyaa.test/api/benefits/x/entries", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "x" }) });
    expect(dependencyTouched).toHaveBeenCalled();
    expect(response.status).toBe(503);
  });
});
