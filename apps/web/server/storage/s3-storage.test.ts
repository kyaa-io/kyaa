import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({ ...await original<typeof import("@aws-sdk/client-s3")>(), S3Client: class { send = mocks.send; } }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));
import { S3Storage } from "./s3-storage";
import { objectKey, storageConfig } from "./config";
const config = { AWS_REGION: "ap-northeast-2", S3_PUBLIC_BUCKET: "public-assets", S3_PRIVATE_BUCKET: "private-assets", ASSET_PUBLIC_BASE_URL: "https://assets.example.test/public-assets" };
const rpc = vi.fn();
const storage = () => new S3Storage(config, { rpc } as never);
beforeEach(() => { mocks.send.mockReset().mockResolvedValue({}); mocks.sign.mockReset().mockResolvedValue("https://private.s3.test/signed"); rpc.mockReset().mockImplementation(async (name) => ({ data: name === "get_s3_storage_object_state" ? null : true, error: null })); });
describe("S3 opt-in storage", () => {
  it("defaults off and rejects incomplete or unsafe configuration", () => {
    expect(storageConfig({})).toBeNull(); expect(storageConfig({ AWS_STORAGE_ENABLED: "false" })).toBeNull();
    expect(() => storageConfig({ AWS_STORAGE_ENABLED: "yes" })).toThrow();
    expect(() => storageConfig({ AWS_STORAGE_ENABLED: "true" })).toThrow();
    expect(storageConfig({ AWS_STORAGE_ENABLED: "true", ...config })).toEqual(config);
    expect(() => storageConfig({ AWS_STORAGE_ENABLED: "true", ...config, S3_PRIVATE_BUCKET: config.S3_PUBLIC_BUCKET })).toThrow();
    expect(() => storageConfig({ AWS_STORAGE_ENABLED: "true", ...config, ASSET_PUBLIC_BASE_URL: "http://assets.test" })).toThrow();
  });
  it.each(["../proof", "a//b", "a/./b", "a\\b", "a\u0000b"])("rejects traversal and malformed keys: %s", path => { expect(() => objectKey("cms-assets", path)).toThrow(); });
  it("keeps every non-editorial bucket private and denies a public URL", async () => {
    const s = storage();
    for (const bucket of ["fan-avatars", "certification-proofs", "fan-content-assets", "mobile-media", "cheer-photocards"]) {
      expect(() => s.from(bucket).getPublicUrl("owner/proof.webp")).toThrow("Private");
      mocks.send.mockResolvedValueOnce({ ContentType: "image/webp", ContentLength: 4, Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("test")); c.close(); } }) } });
      await s.response(bucket, "owner/proof.webp");
      expect(mocks.send.mock.calls.at(-1)?.[0].input).toMatchObject({ Bucket: "private-assets", Key: `${bucket}/owner/proof.webp` });
    }
    expect(s.from("cms-assets").getPublicUrl("a b.webp").data.publicUrl).toBe("https://assets.example.test/public-assets/cms-assets/a%20b.webp");
  });
  it("reserves before immutable upload and confirms actual size/hash after success", async () => {
    const result = await storage().from("cms-assets").upload("asset.webp", new Uint8Array([1, 2]), { contentType: "image/webp", upsert: false });
    expect(result.error).toBeNull();
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["reserve_s3_storage_object", "confirm_s3_storage_object"]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_bucket: "cms-assets", p_size: 2, p_content_type: "image/webp", p_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mocks.send.mock.calls[0][0].input).toMatchObject({ Bucket: "public-assets", Key: "public-assets/cms-assets/asset.webp", IfNoneMatch: "*", ContentLength: 2, ContentType: "image/webp" });
  });
  it("rejects MIME/size before metadata or S3 and retains duplicate status", async () => {
    expect((await storage().from("fan-avatars").upload("a", new Uint8Array([1]), { contentType: "text/html" })).error).toBeTruthy();
    expect((await storage().from("certification-proofs").upload("a", new Uint8Array(3145729), { contentType: "image/webp" })).error).toBeTruthy();
    expect(mocks.send).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
    mocks.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } });
    expect((await storage().from("cms-assets").upload("a", new Uint8Array([1]), { contentType: "image/webp" })).error?.statusCode).toBe("409");
    expect(rpc).not.toHaveBeenCalledWith("confirm_s3_storage_object", expect.anything());
  });
  it("persists deletion intent before I/O and leaves failed deletion for retry", async () => {
    rpc.mockResolvedValue({ data: 7, error: null }); mocks.send.mockRejectedValueOnce(new Error("S3 down"));
    expect((await storage().from("certification-proofs").remove(["owner/proof.webp"])).error).toBeTruthy();
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["queue_s3_storage_delete", "finish_s3_storage_delete"]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_generation: 7, p_succeeded: false });
    rpc.mockResolvedValueOnce({ data: [{ bucket: "certification-proofs", path: "owner/proof.webp", generation: 8 }], error: null });
    await storage().drainDeletes();
    expect(rpc).toHaveBeenLastCalledWith("finish_s3_storage_delete", expect.objectContaining({ p_generation: 8, p_succeeded: true }));
  });
  it("preserves Range/HEAD status and headers without exposing credentials", async () => {
    mocks.send.mockResolvedValueOnce({ ContentType: "video/mp4", ContentLength: 2, ContentRange: "bytes 0-1/4", Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("ab")); c.close(); } }) } });
    const response = await storage().response("mobile-media", "owner/video.mp4", { range: "bytes=0-1" });
    expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 0-1/4"); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("ab");
    mocks.send.mockResolvedValueOnce({ ContentType: "video/mp4", ContentLength: 4 });
    const head = await storage().response("mobile-media", "owner/video.mp4", { method: "HEAD" });
    expect(head.body).toBeNull(); expect(head.headers.get("content-length")).toBe("4");
    mocks.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 416 } });
    expect((await storage().response("mobile-media", "owner/video.mp4", { range: "bytes=99-100" })).status).toBe(416);
  });
  it("signs only a live mobile reservation with exact content length/type and bounded lifetime", async () => {
    rpc.mockResolvedValueOnce({ data: { contentType: "image/jpeg", byteSize: 5 }, error: null });
    const result = await storage().from("mobile-media").createSignedUploadUrl("owner/source.jpg");
    expect(result.error).toBeNull();
    expect(mocks.sign.mock.calls[0][1].input).toMatchObject({ Bucket: "private-assets", ContentType: "image/jpeg", ContentLength: 5, IfNoneMatch: "*" });
    expect(mocks.sign.mock.calls[0][2]).toMatchObject({ expiresIn: 7200 });
    expect((await storage().from("cms-assets").createSignedUploadUrl("a")).error).toBeTruthy();
    expect((await storage().from("certification-proofs").createSignedUrl("a", 7201)).error).toBeTruthy();
  });
});

it("denies tombstoned private objects even for ranged reads before contacting S3", async () => {
  rpc.mockResolvedValueOnce({ data: "delete_pending", error: null });
  expect((await storage().response("mobile-media", "owner/video.mp4", { range: "bytes=0-1" })).status).toBe(404);
  expect(mocks.send).not.toHaveBeenCalled();
});

it("rejects a corrupt signed-upload reservation without generating a signature", async () => {
  rpc.mockResolvedValueOnce({ data: { contentType: "text/html", byteSize: 4 }, error: null });
  expect((await storage().from("mobile-media").createSignedUploadUrl("owner/source.jpg")).error).toBeTruthy();
  expect(mocks.sign).not.toHaveBeenCalled();
});
