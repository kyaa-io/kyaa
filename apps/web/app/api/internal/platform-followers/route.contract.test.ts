import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" }) }));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));

const secret = "a".repeat(32);
const body = JSON.stringify({ items: [{ celebritySlug: "aryeom", platform: "instagram", accountUrl: "https://www.instagram.com/aryeomii/", text: "7.6만" }] });
const post = (init: RequestInit) => new Request("https://example.com/api/internal/platform-followers", { method: "POST", ...init });
afterEach(() => vi.unstubAllEnvs());

describe("internal platform follower route", () => {
  it("requires the existing SNS collector secret", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    const { POST } = await import("./route");
    expect((await POST(post({ body }))).status).toBe(401);
  });
  it("rejects a malformed body", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    const { POST } = await import("./route");
    expect((await POST(post({ body: "{\"items\":[]}", headers: { authorization: `Bearer ${secret}` } }))).status).toBe(400);
  });
  it("saves through the collector function for authenticated requests", async () => {
    vi.stubEnv("SNS_INGEST_SECRET", secret);
    const { createClient } = await import("@/server/data/client");
    const rpc = vi.fn(async (name: string) => ({ data: name === "sns_ingest_source_context"
      ? { celebrityId: "fa400000-0000-4000-8000-0000000000d1", accountUrl: "https://www.instagram.com/aryeomii/" } : true, error: null }));
    vi.mocked(createClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createClient>);
    const { POST } = await import("./route");
    const response = await POST(post({ body, headers: { authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ saved: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith("save_collected_platform_followers", expect.objectContaining({ p_count: 76000, p_digits: 2, p_text: "7.6만" }));
  });
});
