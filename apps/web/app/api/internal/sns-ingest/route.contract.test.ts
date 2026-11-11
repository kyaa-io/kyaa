import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/server/sns-ingest/dependencies", () => ({ createSnsIngestDependencies: vi.fn() }));

it("keeps ingestion disabled without the dedicated secret", async () => {
  vi.stubEnv("SNS_INGEST_SECRET", "");
  try {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.com/api/internal/sns-ingest", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "SNS_INGEST_NOT_CONFIGURED" } });
    const { createSnsIngestDependencies } = await import("@/server/sns-ingest/dependencies");
    expect(createSnsIngestDependencies).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
