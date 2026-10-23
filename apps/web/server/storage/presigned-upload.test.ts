import { expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { S3Storage } from "./s3-storage";
it("produces an actual PUT signature bound to the reserved content and no-overwrite header", async () => {
  const config = { AWS_REGION: "ap-northeast-2", S3_PUBLIC_BUCKET: "public-assets", S3_PRIVATE_BUCKET: "private-assets", ASSET_PUBLIC_BASE_URL: "https://assets.example.test/public-assets" };
  // Local signing fixture only; the test performs no AWS requests.
  const s3 = new S3Client({ region: config.AWS_REGION, requestChecksumCalculation: "WHEN_REQUIRED", credentials: { accessKeyId: "local-fixture", secretAccessKey: "local-fixture" } });
  try {
    const rpc = vi.fn(async () => ({ data: { contentType: "video/mp4", byteSize: 512 }, error: null }));
    const result = await new S3Storage(config, { rpc } as never, s3).from("mobile-media").createSignedUploadUrl("owner/source.mp4");
    expect(result.error).toBeNull();
    const url = new URL(result.data!.signedUrl);
    expect(url.hostname).toBe("private-assets.s3.ap-northeast-2.amazonaws.com");
    expect(url.pathname).toBe("/mobile-media/owner/source.mp4");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("7200");
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(expect.arrayContaining(["content-length", "content-type", "if-none-match"]));
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
    expect(result.data!.token).toMatch(/^s3\./);
  } finally { s3.destroy(); }
});
