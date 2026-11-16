import { afterEach, describe, expect, it, vi } from "vitest";

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test", CHZZK_CLIENT_ID: "client", CHZZK_CLIENT_SECRET: "secret" as string | undefined };
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => env }));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));
vi.mock("@/server/platform-followers/chzzk", () => ({ collectChzzkFollowers: vi.fn() }));

const secret = "a".repeat(32);
const post = (headers: Record<string, string> = {}) => new Request("https://example.com/api/internal/chzzk-followers", { method: "POST", headers });
afterEach(() => vi.unstubAllEnvs());

describe("internal CHZZK follower route", () => {
  it("requires the existing SNS collector secret", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    const { POST } = await import("./route");
    expect((await POST(post())).status).toBe(401);
  });
  it("reports missing CHZZK credentials instead of saving", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    env.CHZZK_CLIENT_SECRET = undefined;
    const { POST } = await import("./route");
    expect((await POST(post({ authorization: `Bearer ${secret}` }))).status).toBe(503);
    env.CHZZK_CLIENT_SECRET = "secret";
  });
  it("runs the collector through the shared save function", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    const { createClient } = await import("@/server/data/client");
    const { collectChzzkFollowers } = await import("@/server/platform-followers/chzzk");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    vi.mocked(createClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createClient>);
    vi.mocked(collectChzzkFollowers).mockImplementation(async (db) => { await db.save("c", "https://chzzk.naver.com/x", 5, "2026-11-16T00:00:00Z"); return { saved: 1, skipped: 0, failed: 0 }; });
    const { POST } = await import("./route");
    expect((await POST(post({ authorization: `Bearer ${secret}` }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_collected_platform_followers", expect.objectContaining({ p_platform: "chzzk", p_count: 5, p_digits: null, p_text: null }));
  });
});
