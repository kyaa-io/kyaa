import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const href = "/connect/runmusic";
const copy = {
  ko: { title: "RUN&MUSIC × kyaa", description: "스타벅스 1만 원권 150명 · 안동참마 요거트 1L 15명", ctaLabel: "이벤트 보기", href, alt: "러닝 트랙과 음악 파형을 표현한 RUN&MUSIC 이벤트 이미지" },
  en: { title: "RUN&MUSIC × kyaa", description: "150 Starbucks ₩10,000 vouchers · 15 안동참마 요거트 1L prizes", ctaLabel: "View event", href, alt: "An illustrated running track turning into music waves." },
};
const imageSpecs = [
  { role: "desktop", file: "apps/web/public/images/runmusic/banner-desktop.png", width: 1774, height: 887 },
  { role: "mobile", file: "apps/web/public/images/runmusic/banner-mobile.png", width: 1122, height: 1402 },
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function readImages() {
  return Promise.all(imageSpecs.map(async spec => {
    const bytes = await readFile(new URL(`../${spec.file}`, import.meta.url));
    assert.ok(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024, "RUNMUSIC_INVALID_IMAGE_SIZE");
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000, sequentialRead: true });
    const metadata = await image.metadata();
    assert.equal(metadata.format, "png", "RUNMUSIC_EXPECTED_PNG");
    assert.deepEqual([metadata.width, metadata.height, metadata.pages ?? 1], [spec.width, spec.height, 1], "RUNMUSIC_IMAGE_DIMENSIONS_CHANGED");
    // Match the existing image API's immutable WebP identity; uploads still use that API.
    const normalized = await image.rotate().webp({ quality: 90, effort: 4 }).toBuffer();
    return { ...spec, bytes, sha256: sha256(bytes), webpSha256: sha256(normalized) };
  }));
}

function matchingBanner(manager, celebrityId, images) {
  assert.ok(Array.isArray(manager.items) && Array.isArray(manager.celebrities), "RUNMUSIC_INVALID_MANAGER_RESPONSE");
  const matches = manager.items.filter(item => Object.values(item.localizations ?? {}).some(value => value.href === href));
  assert.ok(matches.length <= 1, "RUNMUSIC_DUPLICATE_EXISTING_BANNERS");
  const banner = matches[0];
  if (!banner) return null;
  assert.equal(banner.kind, "announcement", "RUNMUSIC_BANNER_MANUALLY_EDITED");
  assert.equal(banner.celebrityId, celebrityId, "RUNMUSIC_BANNER_MANUALLY_EDITED");
  for (const locale of ["ko", "en"]) {
    for (const [key, value] of Object.entries(copy[locale])) assert.equal(banner.localizations[locale]?.[key], value, "RUNMUSIC_BANNER_MANUALLY_EDITED");
    for (const image of images) {
      const asset = banner.localizations[locale][`${image.role}Image`];
      assert.ok(asset, "RUNMUSIC_BANNER_ARTWORK_CHANGED");
      assert.deepEqual([asset.width, asset.height, asset.mimeType], [image.width, image.height, "image/webp"], "RUNMUSIC_BANNER_ARTWORK_CHANGED");
      assert.ok(asset.url?.endsWith(`/storage/v1/object/public/cms-assets/public-image-assets/${image.webpSha256}.webp`), "RUNMUSIC_BANNER_ARTWORK_CHANGED");
    }
  }
  return banner;
}

export async function prepareRunmusicHomeBanner({ apply = false, env = process.env, fetcher = globalThis.fetch } = {}) {
  const images = await readImages();
  const localization = (desktopAssetId, mobileAssetId) => Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, { ...value, desktopAssetId, mobileAssetId }]));
  if (!apply) return {
    status: "PREVIEW", apply: false,
    images: images.map(({ bytes, ...image }) => ({ ...image, byteSize: bytes.length })),
    lookup: { endpoint: "/api/admin/home-banners", celebritySlug: "runmusic", existingHref: href },
    upload: { endpoint: "/api/admin/image-assets", method: "POST", multipartField: "file", normalization: "existing API: WebP quality 90, effort 4" },
    saveTemplate: { action: "save", id: null, expectedRevision: 0, kind: "announcement", celebrityId: "<runmusic celebrity ID>", localizations: localization("<uploaded desktop asset ID>", "<uploaded mobile asset ID>") },
    publicationTemplate: { action: "publication", id: "<banner ID>", expectedRevision: "<current revision>", publicationStatus: "published" },
    reorder: "Move this banner first; preserve the current relative order and revisions of every other banner.",
    existing: "Reuse matching content; stop on manual copy or artwork changes. No network requests in preview.",
  };
  assert.ok(env.RUNMUSIC_ADMIN_TOKEN?.trim(), "RUNMUSIC_ADMIN_TOKEN_REQUIRED");
  assert.ok(env.RUNMUSIC_APP_URL, "RUNMUSIC_APP_URL_REQUIRED");
  const base = new URL(env.RUNMUSIC_APP_URL);
  assert.ok(!base.username && !base.password && !base.search && !base.hash && base.pathname === "/"
    && (base.protocol === "https:" || (base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))), "RUNMUSIC_INVALID_APP_URL");
  async function request(endpoint, body) {
    const multipart = body instanceof FormData;
    const response = await fetcher(new URL(endpoint, base), {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${env.RUNMUSIC_ADMIN_TOKEN.trim()}`, "x-correlation-id": randomUUID(), ...(body && !multipart ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    assert.ok(response.ok, `RUNMUSIC_ADMIN_API_FAILED: ${body ? "POST" : "GET"} ${endpoint} (${response.status})`);
    return response.json();
  }
  const endpoint = "/api/admin/home-banners";
  let manager = await request(endpoint);
  assert.ok(Array.isArray(manager.celebrities), "RUNMUSIC_INVALID_MANAGER_RESPONSE");
  const creators = manager.celebrities.filter(item => item.slug === "runmusic");
  assert.equal(creators.length, 1, "RUNMUSIC_CELEBRITY_REQUIRED");
  const celebrityId = creators[0].id;
  let banner = matchingBanner(manager, celebrityId, images);
  if (!banner) {
    const assets = [];
    for (const image of images) {
      const form = new FormData();
      form.set("file", new File([image.bytes], `banner-${image.role}.png`, { type: "image/png" }));
      const { asset } = await request("/api/admin/image-assets", form);
      assert.ok(asset?.id && asset.url?.endsWith(`/storage/v1/object/public/cms-assets/public-image-assets/${image.webpSha256}.webp`), "RUNMUSIC_UPLOAD_IDENTITY_MISMATCH");
      assert.deepEqual([asset.width, asset.height, asset.mimeType], [image.width, image.height, "image/webp"], "RUNMUSIC_UPLOAD_DIMENSIONS_MISMATCH");
      assets.push(asset);
    }
    // Recheck after uploads so a newly existing banner is never overwritten.
    manager = await request(endpoint);
    banner = matchingBanner(manager, celebrityId, images);
    if (!banner) {
      manager = await request(endpoint, { action: "save", id: null, expectedRevision: 0, kind: "announcement", celebrityId, localizations: localization(assets[0].id, assets[1].id) });
      banner = matchingBanner(manager, celebrityId, images);
    }
  }
  assert.ok(banner, "RUNMUSIC_BANNER_MISSING");
  if (banner.publicationStatus !== "published") {
    manager = await request(endpoint, { action: "publication", id: banner.id, expectedRevision: banner.revision, publicationStatus: "published" });
    banner = matchingBanner(manager, celebrityId, images);
  }
  assert.ok(banner?.publicationStatus === "published", "RUNMUSIC_BANNER_NOT_PUBLISHED");
  const order = [banner, ...manager.items.filter(item => item.id !== banner.id)].map(item => ({ id: item.id, expectedRevision: item.revision }));
  if (manager.items[0]?.id !== banner.id) manager = await request(endpoint, { action: "reorder", items: order });
  const final = matchingBanner(manager, celebrityId, images);
  assert.ok(final?.publicationStatus === "published", "RUNMUSIC_BANNER_NOT_PUBLISHED");
  assert.deepEqual(manager.items.map(item => item.id), order.map(item => item.id), "RUNMUSIC_BANNER_ORDER_MISMATCH");
  return { status: "PASS", bannerId: final.id, first: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.ok(process.argv.slice(2).every(arg => arg === "--apply"), "Usage: node scripts/prepare-runmusic-home-banner.mjs [--apply]");
    console.log(JSON.stringify(await prepareRunmusicHomeBanner({ apply: process.argv.includes("--apply") }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
