import { afterEach, expect, it, vi } from "vitest";
import { S3Storage } from "./s3-storage";
import { storageObjectResponse, type StorageConnection } from "./transport";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("uses private S3 transport without any legacy URL or key", async () => {
  const storage = new S3Storage({ AWS_REGION: "ap-northeast-2", S3_PUBLIC_BUCKET: "public-assets", S3_PRIVATE_BUCKET: "private-assets", ASSET_PUBLIC_BASE_URL: "https://assets.example.test/public-assets" }, { rpc: vi.fn() } as never);
  const response = vi.spyOn(storage, "response").mockResolvedValue(new Response("proof"));
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const connection: StorageConnection = { database: { storage: storage as unknown as StorageConnection["database"]["storage"] }, url: undefined, key: undefined };
  expect(await (await storageObjectResponse(connection, "certification-proofs", "owner/proof.webp", { range: "bytes=0-4" })).text()).toBe("proof");
  expect(response).toHaveBeenCalledWith("certification-proofs", "owner/proof.webp", { range: "bytes=0-4" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires real legacy credentials before constructing a Supabase request", async () => {
  const connection: StorageConnection = { database: { storage: {} as never }, url: undefined, key: undefined };
  const fetcher = vi.fn().mockResolvedValue(new Response("legacy")); vi.stubGlobal("fetch", fetcher);
  expect(() => storageObjectResponse(connection, "mobile-media", "owner/video.mp4")).toThrow("Legacy storage connection not configured");
  expect(fetcher).not.toHaveBeenCalled();
  await storageObjectResponse({ ...connection, url: "https://project.supabase.co", key: "test-key" }, "mobile-media", "owner/my video.mp4", { method: "HEAD", range: "bytes=0-1" });
  expect(fetcher).toHaveBeenCalledWith("https://project.supabase.co/storage/v1/object/authenticated/mobile-media/owner/my%20video.mp4", expect.objectContaining({ method: "HEAD", headers: { apikey: "test-key", authorization: "Bearer test-key", range: "bytes=0-1" } }));
});
