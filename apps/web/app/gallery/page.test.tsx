import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import page from "@/server/home-gallery/fixtures/read_public_home_gallery_page_first.json";
import empty from "@/server/home-gallery/fixtures/read_public_home_gallery_page_empty.json";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect, usePathname: () => "/gallery", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import HomeGalleryPage from "./page";
import { encodeHomeGalleryCursor } from "@/server/home-gallery/home-gallery-repository";

const open = (params: Record<string, string>) => HomeGalleryPage({ searchParams: Promise.resolve(params) });
beforeEach(() => { state.rpc.mockReset(); state.redirect.mockClear(); });

// Real read_public_home_gallery_page responses (supabase/tests/home_gallery_cursor.sh).
describe("/gallery page", () => {
  it("shows the read photos and the load-more button", async () => {
    state.rpc.mockResolvedValue({ data: page, error: null });
    render(await open({ locale: "ko" }));
    // Two photos in each of the two layouts (mobile 2 columns, desktop 4 columns) that CSS switches between.
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /더 보기/ })).toBeInTheDocument();
  });
  it("shows the empty row only for a read that found nothing", async () => {
    state.rpc.mockResolvedValue({ data: empty, error: null });
    render(await open({}));
    expect(screen.getByText("아직 사진 없음")).toBeInTheDocument();
  });
  it("sends a database failure to the error screen instead of an empty list", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "connection terminated" } });
    await expect(open({ locale: "ko" })).rejects.toThrow(/connection terminated/);
  });
  it("continues after the sort key in the cursor it issued, and still reads a position cursor from before the change", async () => {
    state.rpc.mockResolvedValue({ data: empty, error: null });
    await open({ locale: "en", cursor: encodeHomeGalleryCursor(page.last!) });
    expect(state.rpc).toHaveBeenLastCalledWith("read_public_home_gallery_page", { p_locale: "en", p_limit: 24, p_after_rank: page.last!.rank, p_after_at: page.last!.at, p_after_id: page.last!.id });
    await open({ locale: "en", cursor: Buffer.from(JSON.stringify({ o: 24 })).toString("base64url") });
    expect(state.rpc).toHaveBeenLastCalledWith("read_public_home_gallery_page", { p_locale: "en", p_limit: 24, p_offset: 24 });
  });
  it("sends a cursor it did not issue back to the first page without reading", async () => {
    await expect(open({ locale: "en", cursor: "bm9wZQ" })).rejects.toThrow("NEXT_REDIRECT /gallery?locale=en");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
