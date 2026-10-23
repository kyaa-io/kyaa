import assert from "node:assert/strict";
import test from "node:test";
import { prepareRunmusicHomeBanner } from "./prepare-runmusic-home-banner.mjs";

const preview = await prepareRunmusicHomeBanner({ env: {}, fetcher: () => { throw Error("unexpected network"); } });
const env = { RUNMUSIC_ADMIN_TOKEN: "test-admin-token", RUNMUSIC_APP_URL: "https://byus.example" };
const id = n => `da000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const assets = preview.images.map((image, index) => ({
  id: id(10 + index), url: `https://cms.example/storage/v1/object/public/cms-assets/public-image-assets/${image.webpSha256}.webp`,
  width: image.width, height: image.height, mimeType: "image/webp", revision: 1,
}));
const localizations = Object.fromEntries(Object.entries(preview.saveTemplate.localizations).map(([locale, row]) => {
  const { desktopAssetId: _desktop, mobileAssetId: _mobile, ...copy } = row;
  return [locale, { ...copy, desktopImage: assets[0], mobileImage: assets[1] }];
}));
const banner = (n = 1) => ({ id: id(n), kind: "announcement", celebrityId: id(9), publicationStatus: "published", revision: 1, sortOrder: n, localizations: structuredClone(localizations) });
const other = n => {
  const item = banner(n);
  for (const row of Object.values(item.localizations)) row.href = `/other-${n}`;
  return item;
};
function mock({ items = [], failAction, failUpload, missingCreator = false } = {}) {
  let manager = { items: structuredClone(items), celebrities: missingCreator ? [] : [{ id: id(9), slug: "runmusic", nameKo: "런앤뮤직", nameEn: "RUNMUSIC" }] };
  const calls = [];
  let uploads = 0;
  async function fetcher(url, options) {
    assert.equal(url.origin, env.RUNMUSIC_APP_URL);
    assert.equal(options.headers.authorization, "Bearer test-admin-token");
    assert.equal(options.redirect, "error");
    assert.match(options.headers["x-correlation-id"], /^[a-f0-9-]{36}$/);
    if (url.pathname === "/api/admin/image-assets") {
      calls.push("upload");
      assert.equal(options.method, "POST");
      assert.ok(options.body instanceof FormData);
      assert.equal(options.headers["content-type"], undefined);
      const entries = [...options.body.entries()];
      assert.equal(entries.length, 1);
      assert.equal(entries[0][0], "file");
      assert.equal(entries[0][1].type, "image/png");
      assert.equal(entries[0][1].name, `banner-${preview.images[uploads].role}.png`);
      if (uploads === failUpload) return Response.json({ error: "failed" }, { status: 503 });
      return Response.json({ asset: assets[uploads++] }, { status: 201 });
    }
    assert.equal(url.pathname, "/api/admin/home-banners");
    if (options.method === "GET") calls.push("read");
    else {
      assert.equal(options.headers["content-type"], "application/json");
      const body = JSON.parse(options.body);
      calls.push(body.action);
      if (body.action === failAction) return Response.json({ error: "failed" }, { status: 409 });
      if (body.action === "save") {
        assert.deepEqual(body, { action: "save", id: null, expectedRevision: 0, kind: "announcement", celebrityId: id(9),
          localizations: Object.fromEntries(Object.entries(preview.saveTemplate.localizations).map(([locale, row]) => [locale, { ...row, desktopAssetId: assets[0].id, mobileAssetId: assets[1].id }])) });
        const created = banner();created.publicationStatus = "draft";manager.items.push(created);
      } else if (body.action === "publication") {
        assert.deepEqual(Object.keys(body).sort(), ["action", "expectedRevision", "id", "publicationStatus"]);
        const item = manager.items.find(item => item.id === body.id);
        assert.equal(body.expectedRevision, item.revision);
        assert.equal(body.publicationStatus, "published");
        item.publicationStatus = body.publicationStatus;item.revision++;
      } else if (body.action === "reorder") {
        assert.deepEqual(Object.keys(body).sort(), ["action", "items"]);
        manager.items = body.items.map(({ id, expectedRevision }) => {
          const item = manager.items.find(item => item.id === id);
          assert.equal(expectedRevision, item.revision);
          return { ...item, revision: item.revision + 1 };
        });
      } else assert.fail("unexpected action");
    }
    return Response.json(manager);
  }
  return { calls, fetcher, items: () => manager.items };
}

test("dry run validates actual files and prints exact plan without env or network", () => {
  assert.equal(preview.status, "PREVIEW");
  assert.equal(preview.apply, false);
  assert.deepEqual(preview.images.map(({ width, height }) => [width, height]), [[1774, 887], [1122, 1402]]);
  assert.equal(preview.saveTemplate.localizations.ko.description, "스타벅스 1만 원권 150명 · 안동참마 요거트 1L 15명");
  assert.equal(preview.saveTemplate.localizations.en.href, "/connect/runmusic");
  assert.ok(preview.images.every(image => image.byteSize > 0 && /^[a-f0-9]{64}$/.test(image.webpSha256)));
});
test("apply creates, publishes, and orders first with the other banner order preserved", async () => {
  const api = mock({ items: [other(3), other(2)] });
  assert.equal((await prepareRunmusicHomeBanner({ apply: true, env, fetcher: api.fetcher })).status, "PASS");
  assert.deepEqual(api.calls, ["read", "upload", "upload", "read", "save", "publication", "reorder"]);
  assert.deepEqual(api.items().map(item => item.id), [id(1), id(3), id(2)]);
});
test("matching published first banner is idempotent and makes no mutations", async () => {
  const api = mock({ items: [banner(), other(3), other(2)] });
  await prepareRunmusicHomeBanner({ apply: true, env, fetcher: api.fetcher });
  assert.deepEqual(api.calls, ["read"]);
});
test("matching existing draft reuses assets and publishes without creating a duplicate", async () => {
  const draft = banner();draft.publicationStatus = "draft";
  const api = mock({ items: [other(3), draft, other(2)] });
  await prepareRunmusicHomeBanner({ apply: true, env, fetcher: api.fetcher });
  assert.deepEqual(api.calls, ["read", "publication", "reorder"]);
  assert.deepEqual(api.items().map(item => item.id), [id(1), id(3), id(2)]);
});
test("manual copy or artwork edits and duplicate routes stop before mutation", async () => {
  for (const edit of [item => { item.localizations.ko.description = "Manual edit"; }, item => { item.localizations.en.mobileImage.url = "https://cms.example/manual.webp"; }]) {
    const existing = banner();edit(existing);
    const api = mock({ items: [existing] });
    await assert.rejects(prepareRunmusicHomeBanner({ apply: true, env, fetcher: api.fetcher }), /MANUALLY_EDITED|ARTWORK_CHANGED/);
    assert.deepEqual(api.calls, ["read"]);
  }
  const api = mock({ items: [banner(), banner(2)] });
  await assert.rejects(prepareRunmusicHomeBanner({ apply: true, env, fetcher: api.fetcher }), /DUPLICATE_EXISTING/);
  assert.deepEqual(api.calls, ["read"]);
});
test("missing credentials and unsafe origins never send requests", async () => {
  const api = mock();
  for (const invalid of [{}, { RUNMUSIC_ADMIN_TOKEN: "token" }, { ...env, RUNMUSIC_APP_URL: "http://public.example" }, { ...env, RUNMUSIC_APP_URL: "https://byus.example/path" }]) {
    await assert.rejects(prepareRunmusicHomeBanner({ apply: true, env: invalid, fetcher: api.fetcher }), /REQUIRED|INVALID_APP_URL/);
  }
  assert.deepEqual(api.calls, []);
});
test("upload or publication failure stops without retrying or reordering", async () => {
  const upload = mock({ failUpload: 1 });
  await assert.rejects(prepareRunmusicHomeBanner({ apply: true, env, fetcher: upload.fetcher }), /API_FAILED/);
  assert.deepEqual(upload.calls, ["read", "upload", "upload"]);
  const publication = mock({ failAction: "publication" });
  await assert.rejects(prepareRunmusicHomeBanner({ apply: true, env, fetcher: publication.fetcher }), /API_FAILED/);
  assert.deepEqual(publication.calls, ["read", "upload", "upload", "read", "save", "publication"]);
  assert.equal(publication.items()[0].publicationStatus, "draft");
});
test("missing celebrity stops before uploads", async () => {
  const api = mock({ missingCreator: true });
  await assert.rejects(prepareRunmusicHomeBanner({ apply: true, env, fetcher: api.fetcher }), /CELEBRITY_REQUIRED/);
  assert.deepEqual(api.calls, ["read"]);
});
