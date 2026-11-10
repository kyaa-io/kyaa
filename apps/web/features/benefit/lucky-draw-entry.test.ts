import { afterEach, describe, expect, it, vi } from "vitest";
import { luckyDrawEntryPreview, luckyDrawPreviewRejection } from "./lucky-draw-entry";

const benefitEntries = vi.fn();
const mobile = { enter: vi.fn(), draw: vi.fn() };
vi.mock("@/server/wave/access", () => ({ withWaveAccess: (handler: unknown) => handler }));
vi.mock("../../server/g4/benefit-route-dependencies", () => ({ createBenefitRouteDependencies: () => { benefitEntries(); return {}; }, benefitsUnavailableResponse: () => new Response(null, { status: 503 }) }));
vi.mock("../../server/g4/benefit-route", () => ({ createPostBenefitEntryHandler: () => async () => Response.json({ ok: true }) }));
vi.mock("@/server/mobile-benefits/dependencies", () => ({ createMobileBenefitsRouteHandlers: () => mobile, mobileBenefitsUnavailable: () => new Response(null, { status: 503 }) }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("lucky draw entry environment", () => {
  it("takes entries only in the development data environment", () => {
    expect(luckyDrawEntryPreview({ BYUS_DATA_ENVIRONMENT: "development" })).toBe(false);
    expect(luckyDrawEntryPreview({ BYUS_DATA_ENVIRONMENT: "production" })).toBe(true);
    expect(luckyDrawEntryPreview({})).toBe(true);
    expect(luckyDrawPreviewRejection({ BYUS_DATA_ENVIRONMENT: "development" })).toBeNull();
  });

  const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const routes = async () => [
    { name: "benefit entries", call: async () => (await import("../../app/api/benefits/[id]/entries/route")).POST(post({}), { params: Promise.resolve({ id: "b" }) }), touched: () => benefitEntries.mock.calls.length },
    { name: "mobile entries", call: async () => (await import("../../app/api/me/mobile-benefits/entries/route")).POST(post({})), touched: () => mobile.enter.mock.calls.length },
    { name: "mobile instant draws", call: async () => (await import("../../app/api/me/mobile-benefits/instant-draws/route")).POST(post({})), touched: () => mobile.draw.mock.calls.length },
  ];

  it.each(["production", undefined])("rejects every entry write with %s and never reaches the repository", async (value) => {
    if (value) vi.stubEnv("BYUS_DATA_ENVIRONMENT", value); else vi.stubEnv("BYUS_DATA_ENVIRONMENT", "");
    for (const route of await routes()) {
      const response = await route.call();
      expect(response.status, route.name).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "LUCKY_DRAW_PREVIEW" } });
      expect(route.touched(), route.name).toBe(0);
    }
  });

  it("lets the existing entry path run in development", async () => {
    vi.stubEnv("BYUS_DATA_ENVIRONMENT", "development");
    mobile.enter.mockResolvedValue(Response.json({ ok: true })); mobile.draw.mockResolvedValue(Response.json({ ok: true }));
    for (const route of await routes()) expect((await route.call()).status, route.name).toBe(200);
    expect(benefitEntries).toHaveBeenCalledOnce(); expect(mobile.enter).toHaveBeenCalledOnce(); expect(mobile.draw).toHaveBeenCalledOnce();
  });
});
