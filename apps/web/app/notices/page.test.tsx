import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "@/server/home-notice/fixtures/read_public_home_notices.json";
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
  it("shows ten per page and numeric links for the actual page count", async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ ...fixture.items[0]!, id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, slug: `notice-${i + 1}`, title: `공지 ${i + 1}` }));
    state.rpc.mockResolvedValue({ data: { items, hasMore: false }, error: null });
    render(await open({ locale: "ko", page: "2" }));
    expect(state.rpc.mock.calls[0]![1].p_limit).toBe(20);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute("href", "/notices?locale=ko");
    expect(screen.getByRole("link", { name: "공지사항 1" })).toHaveAttribute("href", "/notices?locale=ko");
    expect(screen.queryByRole("link", { name: "다음" })).not.toBeInTheDocument();
    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
  });
  it("counts every cursor batch before showing numbered pages", async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ ...fixture.items[0]!, id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, slug: `notice-${i + 1}`, title: `공지 ${i + 1}` }));
    state.rpc.mockResolvedValueOnce({ data: { items: items.slice(0, 20), hasMore: true }, error: null }).mockResolvedValueOnce({ data: { items: items.slice(20), hasMore: false }, error: null });
    render(await open({ locale: "ko", page: "3" }));
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.rpc.mock.calls[1]![1].p_before_id).toBe(items[19]!.id);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("3")).toHaveAttribute("aria-current", "page");
  });
  it("returns an out-of-range page to the last page", async () => {
    state.rpc.mockResolvedValue({ data: empty, error: null });
    await expect(open({ locale: "ko", page: "100" })).rejects.toThrow("NEXT_REDIRECT /notices?locale=ko&page=1");
  });
  it("sends a cursor it did not issue back to the first page without reading", async () => {
    await expect(open({ locale: "en", cursor: "bm9wZQ" })).rejects.toThrow("NEXT_REDIRECT /notices?locale=en");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
