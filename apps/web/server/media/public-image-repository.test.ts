import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));
import { PublicImageRepository } from "./public-image-repository";

const actor = { appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222", email: "admin@example.com", role: "admin" as const };
const asset = { id: "33333333-3333-4333-8333-333333333333", url: `https://project.supabase.co/storage/v1/object/public/cms-assets/public-image-assets/${"a".repeat(64)}.webp`, width: 440, height: 440, mimeType: "image/webp", revision: 1 };

afterEach(() => vi.unstubAllEnvs());

describe("public image repository", () => {
  it("uploads a content-addressed immutable object without overwrite and registers metadata through the guarded RPC", async () => {
    const upload = vi.fn(async () => ({ data: { path: "stored" }, error: null }));
    const getPublicUrl = vi.fn(() => ({ data: { publicUrl: asset.url } }));
    const rpc = vi.fn(async () => ({ data: asset, error: null }));
    const repository = new PublicImageRepository({ storage: { from: vi.fn(() => ({ upload, getPublicUrl })) }, rpc } as never, "https://project.supabase.co");
    const image = { bytes: new Uint8Array([1, 2, 3]), width: 440, height: 440, mimeType: "image/webp" as const, sha256: "a".repeat(64) };
    await expect(repository.register(actor, "44444444-4444-4444-8444-444444444444", image)).resolves.toEqual(asset);
    expect(upload).toHaveBeenCalledWith(`public-image-assets/${"a".repeat(64)}.webp`, image.bytes, expect.objectContaining({ upsert: false }));
    expect(rpc).toHaveBeenCalledWith("register_admin_public_image_asset", expect.objectContaining({ p_actor_app_user_id: actor.appUserId, p_content_sha256: "a".repeat(64), p_byte_size: 3 }));
  });

  it("does not hide a non-duplicate storage failure behind metadata registration", async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: "storage unavailable", statusCode: 500 } }));
    const rpc = vi.fn();
    const repository = new PublicImageRepository({ storage: { from: vi.fn(() => ({ upload, getPublicUrl: vi.fn() })) }, rpc } as never, "https://project.supabase.co");
    await expect(repository.register(actor, crypto.randomUUID(), { bytes: new Uint8Array([1]), width: 1, height: 1, mimeType: "image/webp", sha256: "b".repeat(64) }))
      .rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(rpc).not.toHaveBeenCalled();
  });
});


it("reads legacy and current CMS URLs from configured AWS storage without fetching legacy or private origins", async () => {
  for (const [key,value] of Object.entries({ AWS_STORAGE_ENABLED:"true",AWS_REGION:"ap-northeast-2",S3_PUBLIC_BUCKET:"public-assets",S3_PRIVATE_BUCKET:"private-assets",ASSET_PUBLIC_BASE_URL:"https://kyaa.io/public-assets" })) vi.stubEnv(key,value);
  const path = "images/사진.webp";
  const current = `https://kyaa.io/public-assets/cms-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const legacy = `https://project.supabase.co/storage/v1/object/public/cms-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const getPublicUrl = vi.fn(() => ({data:{publicUrl:current}}));
  const from = vi.fn(() => ({getPublicUrl}));
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array([1,2,3])));
  const repository = new PublicImageRepository({storage:{from},rpc:vi.fn()} as never,"https://project.supabase.co",fetcher);
  for (const source of [legacy,current]) {
    await expect(repository.downloadCurrentCmsAsset(source)).resolves.toEqual(new Uint8Array([1,2,3]));
    expect(from).toHaveBeenLastCalledWith("cms-assets");expect(getPublicUrl).toHaveBeenLastCalledWith(path);
    expect(fetcher).toHaveBeenLastCalledWith(current,expect.objectContaining({redirect:"error",signal:expect.any(AbortSignal)}));
  }
  fetcher.mockClear();from.mockClear();
  for (const source of ["https://evil.test/image.webp","https://other.supabase.co/storage/v1/object/public/cms-assets/image.webp","https://project.supabase.co/storage/v1/object/sign/cms-assets/image.webp?token=secret","https://kyaa.io/public-assets/certification-proofs/private.webp","https://project.supabase.co/storage/v1/object/public/cms-assets/image.webp?download=1"]) {
    await expect(repository.downloadCurrentCmsAsset(source)).rejects.toMatchObject({code:"INVALID_SOURCE"});
  }
  expect(fetcher).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
});
it("keeps legacy fetch behavior when AWS storage is disabled", async () => {
  vi.stubEnv("AWS_STORAGE_ENABLED","false");
  const source="https://project.supabase.co/storage/v1/object/public/cms-assets/image.webp";
  const from=vi.fn();const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1])));
  const repository=new PublicImageRepository({storage:{from},rpc:vi.fn()} as never,"https://project.supabase.co",fetcher);
  await expect(repository.downloadCurrentCmsAsset(source)).resolves.toEqual(new Uint8Array([1]));
  expect(fetcher).toHaveBeenCalledWith(source,expect.objectContaining({redirect:"error"}));expect(from).not.toHaveBeenCalled();
});
