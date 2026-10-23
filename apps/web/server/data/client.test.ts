import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createClient } from "./client";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const key = "s".repeat(48);
it.each([false, true])("preserves DB response and original storage endpoints (PostgREST=%s)", async enabled => {
  vi.stubEnv("AWS_STORAGE_ENABLED", "false");
  vi.stubEnv("POSTGREST_URL", enabled ? "http://rest.internal:3000" : undefined); vi.stubEnv("POSTGREST_SERVICE_TOKEN", enabled ? "t".repeat(48) : undefined);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([{ id: "row" }])); vi.stubGlobal("fetch", fetcher);
  const client = createClient("https://project.supabase.co", key, options);
  await expect(client.rpc("example", { p_owner: "owner" })).resolves.toMatchObject({ data: [{ id: "row" }], error: null });
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${enabled ? "http://rest.internal:3000" : "https://project.supabase.co/rest/v1"}/rpc/example`);
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(`Bearer ${enabled ? "t".repeat(48) : key}`);
  await client.storage.from("certification-proofs").download("private/proof.webp");
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("https://project.supabase.co/storage/v1/object/certification-proofs/");
});
it("rejects partial PostgREST configuration before any network call", () => {
  vi.stubEnv("POSTGREST_URL", "http://rest.internal:3000"); vi.stubEnv("POSTGREST_SERVICE_TOKEN", undefined);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(() => createClient("https://project.supabase.co", key, options)).toThrow("must be configured together"); expect(fetcher).not.toHaveBeenCalled();
});

it("rejects non-HTTP REST endpoints before constructing a client", () => {
  vi.stubEnv("POSTGREST_URL", "ftp://rest.internal"); vi.stubEnv("POSTGREST_SERVICE_TOKEN", "t".repeat(48));
  expect(() => createClient("https://project.supabase.co", key, options)).toThrow();
});

it("installs S3 storage only after the full explicit opt-in", async () => {
  vi.stubEnv("POSTGREST_URL", undefined); vi.stubEnv("POSTGREST_SERVICE_TOKEN", undefined);
  for (const [name, value] of Object.entries({ AWS_STORAGE_ENABLED: "true", AWS_REGION: "ap-northeast-2", S3_PUBLIC_BUCKET: "public-assets", S3_PRIVATE_BUCKET: "private-assets", ASSET_PUBLIC_BASE_URL: "https://assets.test/public-assets" })) vi.stubEnv(name, value);
  const { S3Storage } = await import("../storage/s3-storage");
  const client = createClient("https://project.supabase.co", key, options);
  expect(client.storage).toBeInstanceOf(S3Storage);
  expect(client.storage.from("cms-assets").getPublicUrl("image.webp").data.publicUrl).toBe("https://assets.test/public-assets/cms-assets/image.webp");
});

it("uses RDS and S3 without any legacy Supabase credentials", async () => {
  for (const [name, value] of Object.entries({ POSTGREST_URL: "http://rest.internal:3000", POSTGREST_SERVICE_TOKEN: "t".repeat(48), AWS_STORAGE_ENABLED: "true", AWS_REGION: "ap-northeast-2", S3_PUBLIC_BUCKET: "public-assets", S3_PRIVATE_BUCKET: "private-assets", ASSET_PUBLIC_BASE_URL: "https://dev.kyaa.io/public-assets" })) vi.stubEnv(name, value);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{id: "owner"}]));
  const client = createClient(undefined, undefined, {...options, global: {fetch: fetcher}});
  await expect(client.rpc("owner")).resolves.toMatchObject({data: [{id: "owner"}]});
  expect(String(fetcher.mock.calls[0]?.[0])).toBe("http://rest.internal:3000/rpc/owner");
  expect(client.storage.from("cms-assets").getPublicUrl("image.webp").data.publicUrl).toBe("https://dev.kyaa.io/public-assets/cms-assets/image.webp");
  vi.stubEnv("AWS_STORAGE_ENABLED", "false");
  expect(() => createClient(undefined, undefined)).toThrow("Storage connection not configured");
});
