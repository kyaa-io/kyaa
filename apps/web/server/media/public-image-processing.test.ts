import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
vi.mock("server-only", () => ({}));
import { currentCmsAssetPath, fetchCurrentCmsAsset, normalizePublicImage, PublicImageError, readLocalPublicImage } from "./public-image-processing";
import { vi } from "vitest";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(item => rm(item, { recursive: true, force: true }))); });

describe("public image processing", () => {
  it("normalizes a raster to metadata-free immutable WebP bytes", async () => {
    const source = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#336699" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await normalizePublicImage(new Uint8Array(source));
    const metadata = await sharp(result.bytes).metadata();
    expect(result).toMatchObject({ width: 480, height: 640, mimeType: "image/webp" });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects SVG even when Sharp can rasterize it", async () => {
    await expect(normalizePublicImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>')))
      .rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  it("allows only canonical local images and current-project cms-assets URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "byus-public-image-")); temporary.push(root);
    await mkdir(path.join(root, "images")); await writeFile(path.join(root, "images", "photo.png"), new Uint8Array([1, 2, 3]));
    await expect(readLocalPublicImage("/images/photo.png", root)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(readLocalPublicImage("/images/%2e%2e/secret.png", root)).rejects.toBeInstanceOf(PublicImageError);
    expect(currentCmsAssetPath("https://project.supabase.co/storage/v1/object/public/cms-assets/lives/photo.jpg", "https://project.supabase.co"))
      .toBe("lives/photo.jpg");
    expect(() => currentCmsAssetPath("https://evil.example/image.jpg", "https://project.supabase.co")).toThrowError(PublicImageError);
    expect(() => currentCmsAssetPath("https://project.supabase.co/storage/v1/object/public/private/file.jpg", "https://project.supabase.co")).toThrowError(PublicImageError);
  });

  it("bounds current-project storage downloads before and during streaming", async () => {
    const source = "https://project.supabase.co/storage/v1/object/public/cms-assets/lives/photo.jpg";
    const declared = vi.fn(async () => new Response("x", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } }));
    await expect(fetchCurrentCmsAsset(source, "https://project.supabase.co", declared as typeof fetch)).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024)); controller.enqueue(new Uint8Array(4 * 1024 * 1024)); controller.close(); } });
    const chunked = vi.fn(async () => new Response(stream));
    await expect(fetchCurrentCmsAsset(source, "https://project.supabase.co", chunked as typeof fetch)).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
    expect(declared).toHaveBeenCalledWith(source, expect.objectContaining({ redirect: "error" }));
  });
});

it("accepts only the configured public CMS path in S3 mode", async () => {
  vi.stubEnv("AWS_STORAGE_ENABLED", "true"); vi.stubEnv("AWS_REGION", "ap-northeast-2");
  vi.stubEnv("S3_PUBLIC_BUCKET", "public-assets"); vi.stubEnv("S3_PRIVATE_BUCKET", "private-assets");
  vi.stubEnv("ASSET_PUBLIC_BASE_URL", "https://assets.example.test/byus");
  try {
    const source = "https://assets.example.test/byus/cms-assets/images/photo.webp";
    expect(currentCmsAssetPath(source, undefined)).toBe("images/photo.webp");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await expect(fetchCurrentCmsAsset(source, undefined, fetcher)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    fetcher.mockClear();
    await expect(fetchCurrentCmsAsset("https://project.supabase.co/storage/v1/object/public/cms-assets/old.webp", undefined, fetcher)).rejects.toMatchObject({ code: "INVALID_SOURCE" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(currentCmsAssetPath(source, "https://project.supabase.co")).toBe("images/photo.webp");
    expect(() => currentCmsAssetPath("https://assets.example.test/byus/certification-proofs/private.webp", "https://project.supabase.co")).toThrow(PublicImageError);
    expect(() => currentCmsAssetPath("https://other.test/byus/cms-assets/images/photo.webp", "https://project.supabase.co")).toThrow(PublicImageError);
    expect(currentCmsAssetPath("https://project.supabase.co/storage/v1/object/public/cms-assets/old.webp", "https://project.supabase.co")).toBe("old.webp");
  } finally { vi.unstubAllEnvs(); }
});
