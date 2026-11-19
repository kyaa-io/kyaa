import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ authorize: state.authorize }) }));
import sqlResult from "./member-event.sql-result.json";
import { GET } from "./route";

const asset = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", url: "https://example.invalid/storage/v1/object/public/cms-assets/a.webp", width: 1440, height: 720, mimeType: "image/webp", revision: 1 };
const banner = (id: string, placement: string) => ({ id, kind: "announcement", celebrityId: null, placement, category: "ad", title: "찐팬100", description: "", ctaLabel: "응원하기", href: "https://partner.example.com/x", alt: "찐팬100", desktopImage: asset, mobileImage: null });

beforeEach(() => vi.clearAllMocks());

it("answers the area's slots, drops a banner in the wrong slot, and asks SQL with the content locale", async () => {
  state.rpc.mockResolvedValue({ data: { home_below_board: banner("11111111-1111-4111-8111-111111111111", "home_below_board"), home_between_events: banner("22222222-2222-4222-8222-222222222222", "fanpage_second") }, error: null });
  const res = await GET(new Request("https://byus.test/api/public/banner-slots?area=home&locale=ja"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Object.keys(body.slots)).toEqual(["home_below_board"]);
  expect(body.slots.home_below_board.category).toBe("ad");
  expect(state.rpc).toHaveBeenCalledWith("read_published_slot_banners", { p_locale: "en", p_area: "home" });
});

it("answers an empty object for empty slots", async () => {
  state.rpc.mockResolvedValue({ data: {}, error: null });
  expect(await (await GET(new Request("https://byus.test/api/public/banner-slots?area=fanpage"))).json()).toEqual({ slots: {} });
});

it("refuses an unknown area or extra query, and says unavailable when SQL fails", async () => {
  expect((await GET(new Request("https://byus.test/api/public/banner-slots?area=groups"))).status).toBe(400);
  expect((await GET(new Request("https://byus.test/api/public/banner-slots?area=home&x=1"))).status).toBe(400);
  state.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
  expect((await GET(new Request("https://byus.test/api/public/banner-slots?area=home"))).status).toBe(503);
});

it("rejects guests before fetching member event data", async () => {
  state.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "Login required"));
  const response = await GET(new Request("https://byus.test/api/public/banner-slots?area=member-event"));
  expect(response.status).toBe(401);
  expect(state.authorize).toHaveBeenCalledWith(null);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("returns member event slots privately after checking the bearer token", async () => {
  state.authorize.mockResolvedValueOnce({});
  state.rpc.mockResolvedValueOnce({ data: sqlResult, error: null });
  const response = await GET(new Request("https://byus.test/api/public/banner-slots?area=member-event", {
    headers: { authorization: "Bearer member" },
  }));
  expect(state.authorize).toHaveBeenCalledWith("Bearer member");
  expect(state.rpc).toHaveBeenCalledWith("read_published_slot_banners", { p_locale: "ko", p_area: "member-event" });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
  expect((await response.json()).slots.member_event_popup.href).toBe(sqlResult.member_event_popup.href);
});
