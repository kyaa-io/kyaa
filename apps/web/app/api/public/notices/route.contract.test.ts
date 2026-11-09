import { beforeEach, expect, it, vi } from "vitest";
import page from "@/server/home-notice/fixtures/read_public_home_notices.json";
import empty from "@/server/home-notice/fixtures/read_public_home_notices_empty.json";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/server/wave/access", () => ({ withWaveAccess: (handler: unknown) => handler }));
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

// Fixtures are real read_public_home_notices responses from supabase/tests/home_notices.sh.
it("answers the real SQL page with a cursor and asks SQL with the content locale", async () => {
  state.rpc.mockResolvedValue({ data: page, error: null });
  const res = await GET(new Request("https://byus.test/api/public/notices?locale=en"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.items.map((item: { slug: string }) => item.slug)).toEqual(["r8data-c", "r8data-d"]);
  expect(body.nextCursor).toEqual(expect.any(String));
  expect(Object.keys(body.items[0]).sort()).toEqual(["category", "id", "pinned", "publishedAt", "slug", "title"]);
  expect(state.rpc).toHaveBeenCalledWith("read_public_home_notices", { p_locale: "en", p_before_pinned: null, p_before: null, p_before_id: null, p_limit: 20 });
});

it("answers an empty page for no notices", async () => {
  state.rpc.mockResolvedValue({ data: empty, error: null });
  expect(await (await GET(new Request("https://byus.test/api/public/notices"))).json()).toEqual({ items: [], nextCursor: null });
});

it("refuses a repeated or unknown key and says unavailable when SQL fails", async () => {
  expect((await GET(new Request("https://byus.test/api/public/notices?locale=ko&locale=en"))).status).toBe(400);
  expect((await GET(new Request("https://byus.test/api/public/notices?x=1"))).status).toBe(400);
  state.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
  expect((await GET(new Request("https://byus.test/api/public/notices"))).status).toBe(503);
});
