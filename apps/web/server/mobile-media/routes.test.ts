import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createMobileMediaHandlers } from "./routes";

const me = "11111111-1111-4111-8111-111111111111", asset = "22222222-2222-4222-8222-222222222222", requestId = "33333333-3333-4333-8333-333333333333";
const rpc = vi.fn(), signUpload = vi.fn(), process = vi.fn(), cleanup = vi.fn(), stream = vi.fn();
const authorize = vi.fn(async (value: string | null) => { if (value !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"); return { appUserId: me }; });
const api = createMobileMediaHandlers({ authorize, rpc, signUpload, process, cleanup, stream });
const state = { assetId: asset, state: "ready", kind: "image", purpose: "dm", contentType: "image/jpeg", byteSize: 100, assetVersion: 1, width: 10, height: 20, durationSeconds: null, failureCode: null, retryAt: null, expiresAt: "2026-10-12T00:00:00Z" };
const request = (path: string, body?: unknown, method = "GET") => new Request(`https://byus.test${path}`, { method, headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("mobile media routes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("reserves one immutable private upload", async () => {
    rpc.mockResolvedValue({ assetId: asset, storagePath: `${me}/${asset}/original.jpg`, expiresAt: state.expiresAt, replayed: false });
    signUpload.mockResolvedValue({ uploadUrl: "https://storage.test/upload", token: "short-token", tokenExpiresAt: "2026-10-12T02:00:00Z" });
    const response = await api.reserve(request("/api/me/media/uploads", { kind: "image", purpose: "dm", contentType: "image/jpeg", byteSize: 100, requestId }, "POST"));
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ assetId: asset, uploadToken: "short-token" });
    expect(rpc).toHaveBeenCalledWith("reserve_owned_mobile_media", { p_app_user_id: me, p_kind: "image", p_purpose: "dm", p_content_type: "image/jpeg", p_byte_size: 100, p_request_id: requestId });
    expect(rpc).toHaveBeenCalledWith("record_owned_mobile_media_upload_token", { p_app_user_id: me, p_asset_id: asset, p_token_expires_at: "2026-10-12T02:00:00Z" });
  });
  it("reserves a validated official post video", async () => {
    rpc.mockResolvedValue({ assetId: asset, storagePath: `${me}/${asset}/original.mp4`, expiresAt: state.expiresAt, replayed: false });
    signUpload.mockResolvedValue({ uploadUrl: "https://storage.test/upload", token: "short-token", tokenExpiresAt: "2026-10-12T02:00:00Z" });
    const response = await api.reserve(request("/api/me/media/uploads", { kind: "video", purpose: "official_post", contentType: "video/mp4", byteSize: 1000, requestId }, "POST"));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("reserve_owned_mobile_media", expect.objectContaining({ p_kind: "video", p_purpose: "official_post" }));
  });
  it("rejects an oversized photo before storage signing", async () => {
    const response = await api.reserve(request("/api", { kind: "image", purpose: "fan_post", contentType: "image/jpeg", byteSize: 8 * 1024 * 1024 + 1, requestId }, "POST"));
    expect(response.status).toBe(400); expect(signUpload).not.toHaveBeenCalled();
  });
  it("stops reading an oversized streamed reservation body", async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5000)); controller.close(); } });
    const oversized = new Request("https://byus.test/api", { method: "POST", headers: { authorization: "Bearer valid" }, body, duplex: "half" } as RequestInit & { duplex: "half" });
    expect((await api.reserve(oversized)).status).toBe(413); expect(rpc).not.toHaveBeenCalled();
  });
  it("queues validation then returns its durable state", async () => {
    rpc.mockResolvedValueOnce({}).mockResolvedValueOnce(state);
    expect((await api.complete(request("/api", undefined, "POST"), asset)).status).toBe(200);
    expect(process).toHaveBeenCalledWith(asset);
  });
  it("rechecks access and forwards Range while streaming the upstream body", async () => {
    rpc.mockResolvedValue({ storagePath: `${me}/${asset}/original.jpg`, contentType: "image/jpeg" });
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close(); } });
    stream.mockResolvedValue(new Response(body, { status: 206, headers: { "content-range": "bytes 0-1/100", "content-length": "2" } }));
    const ranged = new Request(`https://byus.test/api/media/${asset}`, { headers: { authorization: "Bearer valid", range: "bytes=0-1" } });
    const response = await api.read(ranged, asset);
    expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 0-1/100"); expect(stream).toHaveBeenCalledWith(`${me}/${asset}/original.jpg`, "bytes=0-1");
  });
  it("fails closed when current access is gone", async () => { rpc.mockResolvedValue(null); expect((await api.read(request(`/api/media/${asset}`), asset)).status).toBe(404); expect(stream).not.toHaveBeenCalled(); });
  it("preserves an authorized unsatisfiable Range response", async () => {
    rpc.mockResolvedValue({ storagePath: "owner/asset/original.mp4", contentType: "video/mp4" });
    stream.mockResolvedValue(new Response(null, { status: 416, headers: { "content-range": "bytes */100" } }));
    const ranged = new Request(`https://byus.test/api/media/${asset}`, { headers: { authorization: "Bearer valid", range: "bytes=200-300" } });
    const response = await api.read(ranged, asset); expect(response.status).toBe(416); expect(response.headers.get("content-range")).toBe("bytes */100");
  });
  it("serves public official images only through the publication ACL", async () => {
    rpc.mockResolvedValueOnce({ storagePath: "author/asset/photo.jpg", contentType: "image/jpeg" });
    stream.mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
    const anonymous = new Request(`https://byus.test/api/public/notice-media/${asset}`);
    expect((await api.read(anonymous, asset, true)).status).toBe(200);
    expect(authorize).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("authorize_public_official_media_read", { p_asset_id: asset, p_variant: "original" });
    rpc.mockResolvedValueOnce(null); stream.mockClear();
    expect((await api.read(anonymous, asset, true)).status).toBe(404);
    expect(stream).not.toHaveBeenCalled();
  });
  it("checks public official media without streaming a response body", async () => {
    rpc.mockResolvedValueOnce({ storagePath: "author/asset/video.mp4", contentType: "video/mp4" });
    stream.mockResolvedValueOnce(new Response(null, { headers: { "content-length": "123" } }));
    const response = await api.read(new Request(`https://byus.test/api/public/notice-media/${asset}`, { method: "HEAD" }), asset, true);
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-length")).toBe("123");
    expect(stream).toHaveBeenCalledWith("author/asset/video.mp4", null, "HEAD");
  });

});
