import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ creator: { roles: ["brand"] } as { roles: string[] } | null, load: vi.fn() }));
vi.mock("@/server/seo/public-content", () => ({ loadSeoCreator: (...args: unknown[]) => { state.load(...args); return state.creator; } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/features/fanpage/ui/wave-programs", () => ({ WaveProgramPage: () => null }));
import ProgramPage from "./page";
const page = (slug = "kyaa-wave-fanpage", program = "live-insight", locale = "ja") => ProgramPage({ params: Promise.resolve({ slug, program }), searchParams: Promise.resolve({ locale }) });
describe("Wave program routing", () => {
  beforeEach(() => { state.creator = { roles: ["brand"] }; state.load.mockClear(); });
  it.each([["other-brand", "live-insight"], ["kyaa-wave-fanpage", "unknown"]])("rejects unsupported route %s/%s", async (slug, program) => {
    await expect(page(slug, program)).rejects.toThrow("not-found"); expect(state.load).not.toHaveBeenCalled();
  });
  it("requires a published brand", async () => { state.creator = null; await expect(page()).rejects.toThrow("not-found"); state.creator = { roles: ["artist"] }; await expect(page()).rejects.toThrow("not-found"); });
  it("retains program and locale", async () => { expect((await page()).props).toEqual({ locale: "ja", program: "live-insight" }); });
});
