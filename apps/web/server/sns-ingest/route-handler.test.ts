import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSnsIngestHandler } from "./route-handler";
import { SnsIngestSourceError } from "./service";

const secret = "s".repeat(40);
const body = { celebritySlug: "wena", platform: "instagram", posts: [] };
const call = (handler: ReturnType<typeof createSnsIngestHandler>, authorization: string | null, payload: unknown = body) =>
  handler(new Request("https://dev.kyaa.io/api/internal/sns-ingest", {
    method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
  }));

describe("POST /api/internal/sns-ingest", () => {
  it("is off without its own secret", async () => {
    const ingest = vi.fn();
    expect((await call(createSnsIngestHandler(() => ({ ingest }), {}), `Bearer ${secret}`)).status).toBe(503);
    expect((await call(createSnsIngestHandler(() => ({ ingest }), { SNS_INGEST_SECRET: "short", CRON_SECRET: secret }), `Bearer ${secret}`)).status).toBe(503);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("refuses other credentials", async () => {
    const ingest = vi.fn();
    const handler = createSnsIngestHandler(() => ({ ingest }), { SNS_INGEST_SECRET: secret, CRON_SECRET: "c".repeat(40) });
    expect((await call(handler, null)).status).toBe(401);
    expect((await call(handler, `Bearer ${"c".repeat(40)}`)).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("rejects unexpected fields and unregistered sources", async () => {
    const ingest = vi.fn(async () => { throw new SnsIngestSourceError("SOURCE_NOT_REGISTERED"); });
    const handler = createSnsIngestHandler(() => ({ ingest }), { SNS_INGEST_SECRET: secret });
    expect((await call(handler, `Bearer ${secret}`, { ...body, title: "요약" })).status).toBe(400);
    const refused = await call(handler, `Bearer ${secret}`);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: { code: "SOURCE_NOT_REGISTERED" } });
  });

  it("returns the run result privately", async () => {
    const handler = createSnsIngestHandler(() => ({ ingest: vi.fn(async () => ({ runId: "r", items: [] })) }) as never, { SNS_INGEST_SECRET: secret });
    const response = await call(handler, `Bearer ${secret}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
