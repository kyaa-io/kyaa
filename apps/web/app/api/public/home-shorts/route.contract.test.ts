import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/server/wave/access", () => ({ withWaveAccess: (handler: unknown) => handler }));
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

it("asks SQL for the page at the offset with the content locale and answers items with hasMore", async () => {
  state.rpc.mockImplementation(async (name: string) => name === "read_public_home_shortform_page" ? { data: { items: [], hasMore: false }, error: null } : { data: {}, error: null });
  const res = await GET(new Request("https://byus.test/api/public/home-shorts?locale=en&offset=12"));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toMatch(/s-maxage=60/);
  expect(await res.json()).toEqual({ items: [], hasMore: false });
  expect(state.rpc).toHaveBeenCalledWith("read_public_home_shortform_page", { p_locale: "en", p_offset: 12, p_limit: 12 });
});

it("refuses a missing, repeated, unknown or out-of-range key, and says unavailable when SQL fails", async () => {
  for (const query of ["", "offset=-1", "offset=01", "offset=2147483636", "offset=0&offset=12", "offset=0&limit=50", "offset=0&locale=fr"]) expect((await GET(new Request(`https://byus.test/api/public/home-shorts?${query}`))).status, query).toBe(400);
  state.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
  expect((await GET(new Request("https://byus.test/api/public/home-shorts?offset=0"))).status).toBe(503);
});
