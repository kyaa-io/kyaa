import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import empty from "@/server/home-notice/fixtures/read_public_home_notices_empty.json";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect, usePathname: () => "/notices", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import HomeNoticesPage from "./page";

const open = (params: Record<string, string>) => HomeNoticesPage({ searchParams: Promise.resolve(params) });
beforeEach(() => { state.rpc.mockReset(); state.redirect.mockClear(); });

describe("/notices page", () => {
  it("shows 아직 공지 없음 only for a read that found nothing; a database failure goes to the error screen", async () => {
    state.rpc.mockResolvedValue({ data: empty, error: null });
    render(await open({}));
    expect(screen.getByText("아직 공지 없음")).toBeInTheDocument();
    state.rpc.mockResolvedValue({ data: null, error: { message: "connection terminated" } });
    await expect(open({ locale: "ko" })).rejects.toThrow(/connection terminated/);
  });
  it("sends a cursor it did not issue back to the first page without reading", async () => {
    await expect(open({ locale: "en", cursor: "bm9wZQ" })).rejects.toThrow("NEXT_REDIRECT /notices?locale=en");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
