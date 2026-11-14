import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" }) }));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));
vi.mock("@/server/youtube-followers/collector", () => ({ collectYouTubeFollowers: vi.fn() }));

const secret = "a".repeat(32);
afterEach(() => vi.unstubAllEnvs());

describe("internal YouTube follower route", () => {
  it("requires the existing SNS collector secret", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.com/api/internal/youtube-followers", { method: "POST" }));
    expect(response.status).toBe(401);
  });
  it("runs the collector only for authenticated requests", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    vi.stubEnv("YOUTUBE_DATA_API_KEY", "test-key");
    const { createClient } = await import("@/server/data/client");
    const { collectYouTubeFollowers } = await import("@/server/youtube-followers/collector");
    vi.mocked(createClient).mockReturnValue({} as ReturnType<typeof createClient>);
    vi.mocked(collectYouTubeFollowers).mockResolvedValue({ saved: 1, skipped: 0, failed: 0 });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.com/api/internal/youtube-followers", { method: "POST", headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(200);
    expect(collectYouTubeFollowers).toHaveBeenCalledOnce();
  });
});
