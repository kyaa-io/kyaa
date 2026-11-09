import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import page from "@/server/home-gallery/fixtures/read_public_home_gallery_photos_page.json";
import empty from "@/server/home-gallery/fixtures/read_public_home_gallery_photos_empty.json";

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

// Real read_public_home_gallery_photos responses (supabase/tests/home_gallery_shorts.sh).
describe("/gallery page", () => {
  it("shows the read photos and the next-page link", async () => {
    state.rpc.mockResolvedValue({ data: page, error: null });
    render(await open({ locale: "ko" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /더 보기/ })).toHaveAttribute("href", `/gallery?locale=ko&cursor=${encodeURIComponent(encodeHomeGalleryCursor(2))}`);
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
  it("sends a cursor it did not issue back to the first page without reading", async () => {
    await expect(open({ locale: "en", cursor: "bm9wZQ" })).rejects.toThrow("NEXT_REDIRECT /gallery?locale=en");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
