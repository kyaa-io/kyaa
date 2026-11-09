import { describe, expect, it, vi } from "vitest";
import { File as UndiciFile } from "node:buffer";
import { FormData as UndiciFormData, Request as UndiciRequest } from "undici";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createHomeNoticeAdminHandlers, type HomeNoticeAdminDependencies } from "./home-notice-routes";
import { HomeNoticeRepository } from "./home-notice-repository";

vi.mock("server-only", () => ({}));

const admin = { email: "admin@example.invalid", role: "admin" as const, appUserId: "a0000000-0000-4000-8000-000000000001", allowlistId: "a0000000-0000-4000-8000-000000000002" };
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const save = (extra: Record<string, unknown> = {}) => ({
  action: "save", slug: "r8data-route", category: "event", pinned: false,
  localizations: { ko: { title: "공지", body: doc("본문") }, en: { title: "Notice", body: doc("Body") } }, ...extra,
});

function setup(rpcResult: { data: unknown; error: { message: string } | null } = { data: "b0000000-0000-4000-8000-000000000001", error: null }, session = admin) {
  const rpc = vi.fn(async () => rpcResult);
  const deps: HomeNoticeAdminDependencies = {
    authorize: vi.fn(async () => session),
    repository: new HomeNoticeRepository({ rpc } as never),
    registerImage: vi.fn(async () => ({ url: "https://db.test/storage/v1/object/public/cms-assets/public-image-assets/x.webp" })),
    invalidatePublicContent: vi.fn(),
  };
  return { rpc, deps, handlers: createHomeNoticeAdminHandlers(() => deps) };
}
const post = (body: unknown) => new Request("https://kyaa.test/api/admin/home-notices", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body) });

describe("home notice admin route", () => {
  it("saves a strict body with category, calls the RPC once and invalidates the public cache once", async () => {
    const { rpc, deps, handlers } = setup();
    const response = await handlers.POST(post(save()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "b0000000-0000-4000-8000-000000000001" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_admin_home_notice", expect.objectContaining({ p_category: "event", p_slug: "r8data-route", p_notice_id: null, p_title_en: "Notice" }));
    expect(deps.invalidatePublicContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["postType", save({ postType: "notice" })],
    ["visibility", save({ visibility: "public" })],
    ["unknown category", save({ category: "news" })],
    ["extra localization key", save({ localizations: { ko: { title: "a", body: doc("b"), alt: "x" }, en: { title: "a", body: doc("b") } } })],
    ["state with extra key", { action: "publish", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 1, category: "event" }],
    ["short archive reason", { action: "archive", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 1, reason: "short" }],
  ])("refuses %s with 400 and no RPC or invalidation", async (_name, body) => {
    const { rpc, deps, handlers } = setup();
    expect((await handlers.POST(post(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(deps.invalidatePublicContent).not.toHaveBeenCalled();
  });

  it("refuses a private content asset image in either language before the RPC", async () => {
    const { rpc, deps, handlers } = setup();
    const privateDoc = { type: "doc", content: [{ type: "image", attrs: { src: "/api/content-assets/c0000000-0000-4000-8000-000000000001", alt: "사진" } }] };
    const response = await handlers.POST(post(save({ localizations: { ko: { title: "공지", body: doc("본문") }, en: { title: "Notice", body: privateDoc } } })));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_BODY" });
    expect(rpc).not.toHaveBeenCalled();
    expect(deps.invalidatePublicContent).not.toHaveBeenCalled();
    const publicDoc = { type: "doc", content: [{ type: "image", attrs: { src: "https://db.test/storage/v1/object/public/cms-assets/public-image-assets/x.webp", alt: "사진" } }] };
    expect((await handlers.POST(post(save({ localizations: { ko: { title: "공지", body: publicDoc }, en: { title: "Notice", body: publicDoc } } })))).status).toBe(200);
  });

  it("maps an RPC failure without invalidating, a revision conflict to 409, and refuses viewers and unauthenticated callers", async () => {
    const conflict = setup({ data: null, error: { message: "home notice revision conflict" } });
    const response = await conflict.handlers.POST(post({ action: "publish", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 3 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "REVISION_CONFLICT" });
    expect(conflict.deps.invalidatePublicContent).not.toHaveBeenCalled();
    const immutable = setup({ data: null, error: { message: "home notice is immutable" } });
    expect((await immutable.handlers.POST(post(save({ id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 2 })))).status).toBe(409);
    expect(immutable.deps.invalidatePublicContent).not.toHaveBeenCalled();
    const viewer = setup(undefined, { ...admin, role: "viewer" as never });
    expect((await viewer.handlers.POST(post(save()))).status).toBe(403);
    expect(viewer.rpc).not.toHaveBeenCalled();
    const anonymous = setup();
    vi.mocked(anonymous.deps.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "missing"));
    expect((await anonymous.handlers.GET(new Request("https://kyaa.test/api/admin/home-notices"))).status).toBe(401);
  });

  it.each([
    ["a taken slug", { message: 'duplicate key value violates unique constraint "home_notices_slug_key"', code: "23505" }, 409, "SLUG_TAKEN"],
    ["a missing notice", { message: "home notice not found", code: "P0001" }, 404, "NOT_FOUND"],
    ["an incomplete publish", { message: "published home notice requires complete ko and en localizations", code: "P0001" }, 409, "INCOMPLETE"],
    ["an archived notice", { message: "home notice archived", code: "P0001" }, 409, "STATE_CONFLICT"],
    ["a database outage", { message: "connection terminated unexpectedly", code: "08006" }, 503, "UNAVAILABLE"],
    ["an unknown SQL error", { message: "something else", code: "XX000" }, 503, "UNAVAILABLE"],
  ])("answers %s with its own status and code, without invalidating", async (_name, sqlError, status, code) => {
    const { deps, handlers } = setup({ data: null, error: sqlError });
    const response = await handlers.POST(post(save({ id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 1 })));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: code });
    expect(deps.invalidatePublicContent).not.toHaveBeenCalled();
  });

  it("answers 503 when the list read fails and when the repository throws outside SQL", async () => {
    const down = setup({ data: null, error: { message: "fetch failed" } });
    expect((await down.handlers.GET(new Request("https://kyaa.test/api/admin/home-notices", { headers: { authorization: "Bearer t" } }))).status).toBe(503);
    const thrown = setup();
    thrown.deps.repository.state = vi.fn(async () => { throw new TypeError("network"); });
    expect((await thrown.handlers.POST(post({ action: "publish", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 1 }))).status).toBe(503);
  });

  it("registers an uploaded image as a public asset and returns only its URL", async () => {
    const { deps, handlers } = setup();
    // Server routes see undici's File; jsdom's globals would not pass `instanceof File` (same as certification-routes.test.ts).
    const browser = { File: globalThis.File, Request: globalThis.Request };
    Object.assign(globalThis, { File: UndiciFile });
    const form = new UndiciFormData();
    form.set("file", new UndiciFile([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const request = new UndiciRequest("https://kyaa.test/api/admin/home-notices/b0000000-0000-4000-8000-000000000001/assets", { method: "POST", headers: { authorization: "Bearer t" }, body: form });
    const response = await handlers.uploadAsset(request as unknown as Request, { params: Promise.resolve({ id: "b0000000-0000-4000-8000-000000000001" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://db.test/storage/v1/object/public/cms-assets/public-image-assets/x.webp" });
    expect(deps.registerImage).toHaveBeenCalledTimes(1);
    const second = new UndiciRequest("https://kyaa.test/api/admin/home-notices/x/assets", { method: "POST", headers: { authorization: "Bearer t" }, body: form });
    expect((await handlers.uploadAsset(second as unknown as Request, { params: Promise.resolve({ id: "not-a-uuid" }) })).status).toBe(400);
    Object.assign(globalThis, browser);
  });
});
