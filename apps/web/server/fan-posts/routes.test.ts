import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { contentFailure, createContentHandlers, type ContentDependencies } from "./routes";

const id = "10000000-0000-4000-8000-000000000001", owner = "20000000-0000-4000-8000-000000000001";
const post = { id, celebritySlug: "artist", body: "hello", visibility: "public", revision: 1,
  author: { nickname: "Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z", isOwner: true, likeCount: 0, liked: false, commentCount: 0 };
function dependencies() {
  return { rpc: vi.fn(), authorize: vi.fn().mockResolvedValue({ appUserId: owner }),
    authorizeAdmin: vi.fn().mockResolvedValue({ appUserId: owner, allowlistId: id, role: "admin", email: "admin@example.test" }),
    upload: vi.fn(), download: vi.fn(), translate: vi.fn(),
  } satisfies ContentDependencies;
}
function request(method = "POST", body?: unknown, url = "https://byus.test/api/posts", authenticated = true) {
  return new Request(url, { method, headers: { ...(authenticated ? { authorization: "Bearer token" } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
describe("fan content trust boundary", () => {
  it("validates period ranking and uses the verified viewer",async()=>{
    const d=dependencies(),h=createContentHandlers(d);d.rpc.mockResolvedValue({items:[post]});
    expect((await h.periodRanking(request("GET",undefined,"https://byus.test/api?period=week&locale=en"),"artist")).status).toBe(200);
    expect(d.rpc).toHaveBeenCalledWith("read_fan_post_period_ranking",{p_app_user_id:owner,p_slug:"artist",p_period:"week",p_locale:"en"});
    expect((await h.periodRanking(request("GET",undefined,"https://byus.test/api?period=invalid"),"artist")).status).toBe(400);
    d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",401,"invalid"));
    expect((await h.periodRanking(request("GET"),"artist")).status).toBe(401);
  });

  it("keeps the pin order in official-news cursors and isolates that cursor from post pages", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockResolvedValue({ notices: [{ id, slug: "pinned", title: "Pinned notice", pinned: true, kind: "standard", postType: "notice", visibility: "public", revision: 1, publishedAt: "2026-09-01T00:00:00Z" }], hasMore: true });
    const response = await h.notices(request("GET"), "artist"), data = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.parse(Buffer.from(data.nextCursor, "base64url").toString())).toMatchObject({ pinned: true, id });
    await h.notices(request("GET", undefined, `https://byus.test/api/notices?cursor=${data.nextCursor}`), "artist");
    expect(d.rpc).toHaveBeenLastCalledWith("read_fan_notices", expect.objectContaining({ p_before_pinned: true, p_before_id: id }));
    expect((await h.posts(request("GET", undefined, `https://byus.test/api/posts?cursor=${data.nextCursor}`), "artist")).status).toBe(400);
  });
  it("validates credentials on public reads and never falls back to anonymous", async () => {
    const d = dependencies(); d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
    expect((await createContentHandlers(d).posts(request("GET"), "artist")).status).toBe(401);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("rejects supplied identity and nonboolean like state", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    expect((await h.posts(request("POST", { body: "hi", visibility: "public", assetIds: [], idempotencyKey: id, appUserId: id }), "artist")).status).toBe(400);
    expect((await h.like(request("PUT", { liked: "false" }), id)).status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("uses only the authenticated actor and forwards idempotency + attachment IDs", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ id, revision: 1, replayed: false });
    const response = await createContentHandlers(d).posts(request("POST", { body: " hi ", visibility: "members", assetIds: [id], idempotencyKey: id }), "artist");
    expect(response.status).toBe(201);
    expect(d.rpc).toHaveBeenCalledWith("save_fan_post", expect.objectContaining({ p_app_user_id: owner, p_body: "hi", p_asset_ids: [id], p_idempotency_key: id, p_expected_revision: null }));
  });
  it("requires ownership before editing and exposes revision conflicts as 409", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ post: { ...post, isOwner: false } });
    const input = { body: "edit", visibility: "public", assetIds: [], expectedRevision: 1 };
    expect((await createContentHandlers(d).post(request("PATCH", input), id)).status).toBe(404);
    expect(d.rpc).toHaveBeenCalledTimes(1);
    d.rpc.mockReset().mockResolvedValueOnce({ post }).mockRejectedValueOnce(new Error("FAN_WEB_CONFLICT"));
    expect((await createContentHandlers(d).post(request("PATCH", input), id)).status).toBe(409);
  });
  it("bounds JSON before parsing and rejects malformed cursor inputs", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    expect((await h.posts(request("POST", { body: "a".repeat(40_000) }), "artist")).status).toBe(413);
    expect((await h.posts(request("GET", undefined, "https://byus.test/api/posts?cursor=bad"), "artist")).status).toBe(400);
    expect((await h.posts(request("GET", undefined, "https://byus.test/api/posts?locale=ko&locale=en"), "artist")).status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("keeps popular pages on a score-and-time cursor and rejects cross-sort reuse", async () => {
    const d = dependencies(), h = createContentHandlers(d);
    d.rpc.mockResolvedValue({ items: [{ ...post, likeCount: 8, commentCount: 3 }], hasMore: true });
    const response = await h.posts(request("GET", undefined, "https://byus.test/api/posts?sort=popular"), "artist");
    const data = await response.json(), cursor = JSON.parse(Buffer.from(data.nextCursor, "base64url").toString());
    expect(response.status).toBe(200);
    expect(cursor).toEqual({ sort: "popular", score: 11, at: post.createdAt, id });
    await h.posts(request("GET", undefined, `https://byus.test/api/posts?sort=popular&cursor=${data.nextCursor}`), "artist");
    expect(d.rpc).toHaveBeenLastCalledWith("read_fan_posts", expect.objectContaining({ p_sort: "popular", p_before_score: 11, p_before_id: id }));
    expect((await h.posts(request("GET", undefined, `https://byus.test/api/posts?cursor=${data.nextCursor}`), "artist")).status).toBe(400);
  });
  it("fails closed on an accidental private field in a public DTO", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ items: [{ ...post, appUserId: owner }], hasMore: false });
    const response = await createContentHandlers(d).posts(request("GET", undefined, undefined, false), "artist");
    expect(response.status).toBe(503); expect(await response.text()).not.toContain(owner);
  });
  it.each(["", "?size=thumbnail"])("never downloads a hidden or inaccessible asset %s", async query => {
    const d = dependencies(); d.rpc.mockResolvedValue(null);
    expect((await createContentHandlers(d).asset(request("GET", undefined, `https://byus.test/api/content-assets/${id}${query}`, false), id)).status).toBe(404);
    expect(d.download).not.toHaveBeenCalled(); expect(d.authorizeAdmin).not.toHaveBeenCalled();
  });
  it("authorizes thumbnails before reading storage and keeps them private", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ storagePath: `${owner}/${id}.webp`, mimeType: "image/webp" });
    d.download.mockResolvedValue(new Blob([new Uint8Array([1, 2])]));
    const response = await createContentHandlers(d).asset(request("GET", undefined, `https://byus.test/api/content-assets/${id}?size=thumbnail`), id);
    expect(response.status).toBe(200);
    expect(d.rpc).toHaveBeenCalledWith("read_content_asset", { p_app_user_id: owner, p_asset_id: id });
    expect(d.download).toHaveBeenCalledWith(`${owner}/${id}.webp`, true);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });
  it.each(["size=full", "size=", "size=thumbnail&size=thumbnail"])("rejects unsupported or repeated image sizes: %s", async query => {
    const d = dependencies();
    const response = await createContentHandlers(d).asset(request("GET", undefined, `https://byus.test/api/content-assets/${id}?${query}`), id);
    expect(response.status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled(); expect(d.download).not.toHaveBeenCalled();
  });
  it("uses no public URL and streams permitted image bytes without shared caching", async () => {
    const d = dependencies(); d.rpc.mockResolvedValue({ storagePath: `${owner}/${id}.webp`, mimeType: "image/webp" });
    d.download.mockResolvedValue(new Blob([new Uint8Array([1, 2])]));
    const response = await createContentHandlers(d).asset(request("GET"), id);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });
  it("does not invoke translation provider for cache hits or inaccessible content", async () => {
    const d = dependencies(), body = { targetType: "fan_post", targetId: id, targetLocale: "en" };
    d.rpc.mockResolvedValue({ ...body, translatedText: "Hello", sourceRevision: 1, cached: true });
    expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(200);
    expect(d.translate).not.toHaveBeenCalled();
    d.rpc.mockRejectedValue(new Error("FAN_WEB_NOT_FOUND"));
    expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(404);
    expect(d.translate).not.toHaveBeenCalled();
  });
  it("reserves quota before provider and refuses stale translated content", async () => {
    const d = dependencies(), body = { targetType: "fan_post", targetId: id, targetLocale: "en" };
    d.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({ body: "안녕", revision: 1, sourceHash: "a".repeat(64) })
      .mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("FAN_WEB_CONFLICT"));
    d.translate.mockResolvedValue({ translatedText: "Hi" });
    expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(409);
    expect(d.rpc.mock.calls[2]).toEqual(["reserve_content_translation_request", { p_app_user_id: owner, p_character_count: 2 }]);
    expect(d.rpc).toHaveBeenLastCalledWith("save_content_translation", expect.objectContaining({ p_source_revision: 1, p_source_hash: "a".repeat(64) }));
  });
  it("denies viewer moderation before mutation and hides database errors", async () => {
    const d = dependencies(); d.authorizeAdmin.mockResolvedValue({ appUserId: owner, allowlistId: id, role: "viewer", email: "viewer@example.test" });
    expect((await createContentHandlers(d).resolveReport(request("PATCH", { resolution: "resolved", hideTarget: true, reason: "moderation reason" }), id)).status).toBe(403);
    expect(d.rpc).not.toHaveBeenCalled();
    d.rpc.mockRejectedValue(new Error("secret database details"));
    const response = await createContentHandlers(d).blocks(request("GET"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  });
});

it("maps rejected content to a safe client error", async () => {
 const response=contentFailure(new Error("CONTENT_REJECTED"));
 expect(response.status).toBe(400); expect(await response.json()).toEqual({error:{code:"CONTENT_REJECTED"}});
});
it("authorizes moderation summary and restricts sanctions to administrators", async () => {
 const d=dependencies(), h=createContentHandlers(d);
 d.rpc.mockResolvedValueOnce({openCount:2,overdueCount:1,oldestDueAt:"2026-10-20T00:00:00Z"});
 expect((await h.adminReportSummary(request("GET"))).status).toBe(200);
 expect(d.rpc).toHaveBeenCalledWith("read_admin_content_report_summary",expect.objectContaining({p_actor_app_user_id:owner}));
 d.authorizeAdmin.mockResolvedValueOnce({appUserId:owner,allowlistId:id,role:"operator",email:"operator@example.test"} as never);
 const result=await h.resolveReport(request("PATCH",{resolution:"resolved",hideTarget:true,restrictAuthor:true,reason:"confirmed abusive content"}),id);
 expect(result.status).toBe(403);expect(d.rpc).toHaveBeenCalledTimes(1);
});

it("returns retryable conflict when the moderation owner is busy", async () => {
  const response=contentFailure(new Error("FAN_WEB_ACCOUNT_BUSY"));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({error:{code:"FAN_WEB_ACCOUNT_BUSY"}});
});
it('reads attachment policy for the authenticated target and never trusts caller ownership',async()=>{const d=dependencies(),h=createContentHandlers(d);d.rpc.mockResolvedValue({photoLimit:10,videoAllowed:true});expect((await h.attachmentPolicy(request('GET'), 'fan')).status).toBe(200);expect(d.rpc).toHaveBeenCalledWith('read_fan_post_attachment_policy',{p_app_user_id:owner,p_slug:'fan'});d.authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED',401,'Sign in'));d.rpc.mockClear();expect((await h.attachmentPolicy(request('GET',undefined,undefined,false),'fan')).status).toBe(401);expect(d.rpc).not.toHaveBeenCalled();});
it('accepts ten wire asset ids for target-scoped SQL validation without expanding the program schema',async()=>{const d=dependencies(),h=createContentHandlers(d),ids=Array.from({length:10},(_,i)=>`92820000-0000-4000-8000-${String(i+100).padStart(12,'0')}`);d.rpc.mockResolvedValue({id,revision:1,replayed:false});expect((await h.posts(request('POST',{body:'Ten',visibility:'public',assetIds:ids,idempotencyKey:id}),'fan')).status).toBe(201);expect(d.rpc).toHaveBeenCalledWith('save_fan_post',expect.objectContaining({p_asset_ids:ids,p_app_user_id:owner,p_slug:'fan'}));expect((await h.posts(request('POST',{body:'Eleven',visibility:'public',assetIds:[...ids,owner],idempotencyKey:id}),'fan')).status).toBe(400);const{createPostSchema}=await import('@/features/fan-posts/domain/content');expect(createPostSchema.safeParse({body:'Legacy/program',visibility:'public',assetIds:ids,idempotencyKey:id}).success).toBe(false);});
