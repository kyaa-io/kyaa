import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect, notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, usePathname: () => "/notices", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
import HomeNoticeDetailPage from "./page";

const open = (slug: string, locale: string) => HomeNoticeDetailPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ locale }) });
beforeEach(() => { state.rpc.mockReset(); state.redirect.mockClear(); });

describe("/notices/[slug]", () => {
  it("sends the mission book notice row to the mission book page, which carries its likes and comments", async () => {
    await expect(open("dukjil-missionbook", "en")).rejects.toThrow("NEXT_REDIRECT /guide/dukjil?locale=en");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("reads every other notice as before", async () => {
    state.rpc.mockResolvedValue({ data: null, error: null });
    await expect(open("service-guide", "ko")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.redirect).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith("read_public_home_notice", { p_locale: "ko", p_slug: "service-guide" });
  });
});
