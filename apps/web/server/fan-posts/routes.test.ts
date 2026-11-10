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
    upload: vi.fn(), download: vi.fn(), translate: vi.fn(), translateTexts: vi.fn(),
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
    expect((await h.posts(request("POST", { body: "a".repeat(300_000) }), "artist")).status).toBe(413);
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
    d.rpc.mockImplementation(async (name: string) => {
      if (name === "fan_web_content_target") return { body: "안녕", revision: 1, sourceHash: "a".repeat(64) };
      if (name === "claim_content_translation_lease") return { status: "claimed", token: "b0000000-0000-4000-8000-000000000001" };
      if (name === "save_content_translation_leased") throw new Error("FAN_WEB_CONFLICT");
      return null;
    });
    d.translate.mockResolvedValue({ translatedText: "Hi" });
    expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(409);
    const names = d.rpc.mock.calls.map(call => call[0]);
    expect(names).toEqual(["read_content_translation", "fan_web_content_target", "claim_content_translation_lease", "read_content_translation", "reserve_content_translation_request", "save_content_translation_leased", "release_content_translation_lease"]);
    expect(d.rpc.mock.calls[2][1]).toMatchObject({ p_scope: "whole", p_source_revision: 1, p_source_hash: "a".repeat(64) });
    expect(d.rpc.mock.calls[4]).toEqual(["reserve_content_translation_request", { p_app_user_id: owner, p_character_count: 2 }]);
    expect(d.rpc.mock.calls[5][1]).toMatchObject({ p_lease_token: "b0000000-0000-4000-8000-000000000001", p_source_revision: 1, p_source_hash: "a".repeat(64) });
  });
  describe("title/article translation slots", () => {
    const body = { targetType: "fan_post", targetId: id, targetLocale: "en", slots: "title-body" };
    const hash = "a".repeat(64), source = { body: "제목\n본문", revision: 1, sourceHash: hash };
    const slotArgs = { p_app_user_id: owner, p_target_type: "fan_post", p_target_id: id, p_target_locale: "en", p_locale: "ko" };
    const stored = (slots: Record<string, string>, cached = true) => ({ targetType: "fan_post", targetId: id, targetLocale: "en", sourceRevision: 1, cached, slots });
    /** Answers each rpc by name; `overrides` replace a name's answer (a function answers per call). */
    function wire(d: ReturnType<typeof dependencies>, overrides: Record<string, unknown> = {}) {
      const answers: Record<string, unknown> = { fan_web_content_target: source, read_content_translation_slots: null, reserve_content_translation_request: null, save_content_translation_slots_leased: null, claim_content_translation_lease: claimed, release_content_translation_lease: null, ...overrides };
      d.rpc.mockImplementation(async (name: string) => { const answer = answers[name]; return typeof answer === "function" ? answer() : answer; });
    }
    const claimed = { status: "claimed", token: "b0000000-0000-4000-8000-000000000001" };
    const names = (d: ReturnType<typeof dependencies>) => d.rpc.mock.calls.map(call => call[0]);
    it("R1 refuses a request without a login before any rpc or provider call", async () => {
      const d = dependencies(); d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
      expect((await createContentHandlers(d).translate(request("POST", body, undefined, false))).status).toBe(401);
      expect(d.rpc).not.toHaveBeenCalled(); expect(d.translateTexts).not.toHaveBeenCalled();
    });
    it("R2 reserves the summed length, translates both slots in one call and stores them by slot", async () => {
      const d = dependencies(); let saved = false;
      wire(d, { save_content_translation_slots_leased: () => { saved = true; return null; }, read_content_translation_slots: () => saved ? stored({ title: "Title", article: "Body" }) : null });
      d.translateTexts.mockResolvedValue([{ translatedText: "Title", detectedSourceLocale: "ko" }, { translatedText: "Body" }]);
      const response = await createContentHandlers(d).translate(request("POST", body));
      expect(response.status).toBe(200); expect(await response.json()).toEqual(stored({ title: "Title", article: "Body" }, false));
      expect(d.translateTexts).toHaveBeenCalledOnce(); expect(d.translateTexts).toHaveBeenCalledWith(["제목", "본문"], "en");
      expect(d.rpc).toHaveBeenCalledWith("reserve_content_translation_request", { p_app_user_id: owner, p_character_count: 4 });
      expect(d.rpc).toHaveBeenCalledWith("save_content_translation_slots_leased", { ...slotArgs, p_lease_token: claimed.token, p_source_revision: 1, p_source_hash: hash, p_slots: { title: "Title", article: "Body" }, p_detected_source_locale: "ko" });
    });
    it("R3 stores each slot as the provider returned it, whatever line breaks it contains", async () => {
      for (const [title, article] of [["Line\nbreak title", "Body"], ["Title", "One line"], ["T", "A\nB"]]) {
        const d = dependencies(); let saved: unknown = null;
        wire(d, { save_content_translation_slots_leased: () => null, read_content_translation_slots: () => saved ? stored({ title, article }) : null });
        d.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
          if (name === "claim_content_translation_lease") return claimed;
          if (name === "fan_web_content_target") return source;
          if (name === "save_content_translation_slots_leased") { saved = args!.p_slots; return null; }
          if (name === "read_content_translation_slots") return saved ? stored({ title, article }) : null;
          return null;
        });
        d.translateTexts.mockResolvedValue([{ translatedText: title }, { translatedText: article }]);
        const response = await createContentHandlers(d).translate(request("POST", body));
        expect(response.status).toBe(200); expect(saved).toEqual({ title, article }); expect((await response.json()).slots).toEqual({ title, article });
      }
    });
    it("R4 never reads the whole-text cache or target through the whole-text functions", async () => {
      const d = dependencies(); wire(d, { read_content_translation_slots: stored({ title: "Title", article: "Body" }) });
      expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(200);
      expect(names(d)).not.toContain("read_content_translation"); expect(names(d)).not.toContain("save_content_translation");
    });
    it("R5 answers a cache hit without reserving or calling the provider", async () => {
      const d = dependencies(); wire(d, { read_content_translation_slots: stored({ title: "Title", article: "Body" }) });
      const response = await createContentHandlers(d).translate(request("POST", body));
      expect(await response.json()).toEqual(stored({ title: "Title", article: "Body" }));
      expect(names(d)).not.toContain("reserve_content_translation_request"); expect(d.translateTexts).not.toHaveBeenCalled();
    });
    it("R6 stores nothing when the provider fails, and a retry recovers", async () => {
      const d = dependencies(); let saved = false;
      wire(d, { save_content_translation_slots_leased: () => { saved = true; return null; }, read_content_translation_slots: () => saved ? stored({ title: "Title", article: "Body" }) : null });
      d.translateTexts.mockRejectedValueOnce(new Error("TRANSLATION_FAILED"));
      expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(503);
      expect(names(d)).not.toContain("save_content_translation_slots_leased");
      d.translateTexts.mockResolvedValueOnce([{ translatedText: "Title" }, { translatedText: "Body" }]);
      expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(200);
      expect(names(d).filter(name => name === "save_content_translation_slots_leased")).toHaveLength(1);
      expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(200);
      expect(d.translateTexts).toHaveBeenCalledTimes(2);
      const wrongCount = dependencies(); wire(wrongCount); wrongCount.translateTexts.mockResolvedValue([{ translatedText: "Title" }]);
      expect((await createContentHandlers(wrongCount).translate(request("POST", body))).status).toBe(503);
      expect(names(wrongCount)).not.toContain("save_content_translation_slots_leased");
    });
    it("R7 translates a title-only or article-only post with that one slot, and refuses other targets and empty sources", async () => {
      for (const [text, slot] of [["제목", "title"], ["\n본문", "article"]] as const) {
        const d = dependencies(); let saved: Record<string, string> | null = null;
        d.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
          if (name === "claim_content_translation_lease") return claimed;
          if (name === "fan_web_content_target") return { ...source, body: text };
          if (name === "save_content_translation_slots_leased") { saved = args!.p_slots as Record<string, string>; return null; }
          if (name === "read_content_translation_slots") return saved ? stored(saved) : null;
          return null;
        });
        d.translateTexts.mockResolvedValue([{ translatedText: "One" }]);
        expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(200);
        expect(d.translateTexts).toHaveBeenCalledWith([slot === "title" ? "제목" : "본문"], "en"); expect(saved).toEqual({ [slot]: "One" });
      }
      const other = dependencies(); wire(other);
      expect((await createContentHandlers(other).translate(request("POST", { ...body, targetType: "notice" }))).status).toBe(400);
      expect(other.rpc).not.toHaveBeenCalled();
      const empty = dependencies(); wire(empty, { fan_web_content_target: { ...source, body: "  " } });
      expect((await createContentHandlers(empty).translate(request("POST", body))).status).toBe(400);
      expect(empty.translateTexts).not.toHaveBeenCalled();
    });
    it("R8 overlapping misses on one key reserve and call the provider once; the second answer is the stored row", async () => {
      const d = dependencies(); let holder: string | null = null, stored_: Record<string, string> | null = null;
      d.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
        if (name === "fan_web_content_target") return source;
        if (name === "claim_content_translation_lease") { if (holder) return { status: "busy" }; holder = "b0000000-0000-4000-8000-000000000001"; return { status: "claimed", token: holder }; }
        if (name === "save_content_translation_slots_leased") { stored_ = args!.p_slots as Record<string, string>; holder = null; return null; }
        if (name === "read_content_translation_slots") return stored_ ? stored(stored_) : null;
        return null;
      });
      d.translateTexts.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return [{ translatedText: "First" }, { translatedText: "First body" }]; });
      const h = createContentHandlers(d);
      const [a, b] = await Promise.all([h.translate(request("POST", body)), h.translate(request("POST", body))]);
      expect(d.translateTexts).toHaveBeenCalledTimes(1); expect(names(d).filter(name => name === "reserve_content_translation_request")).toHaveLength(1);
      expect(names(d).filter(name => name === "save_content_translation_slots_leased")).toHaveLength(1);
      const answers = [await a.json(), await b.json()];
      expect(answers.map(answer => answer.slots)).toEqual([{ title: "First", article: "First body" }, { title: "First", article: "First body" }]);
      expect(answers.map(answer => answer.cached).sort()).toEqual([false, true]);
    });
    it("R9 returns 404 without a re-read or translated text when the post vanishes during the provider call", async () => {
      const d = dependencies(); wire(d, { save_content_translation_slots_leased: () => { throw new Error("FAN_WEB_NOT_FOUND"); } });
      d.translateTexts.mockResolvedValue([{ translatedText: "Secret title" }, { translatedText: "Secret body" }]);
      const response = await createContentHandlers(d).translate(request("POST", body));
      expect(response.status).toBe(404); expect(JSON.stringify(await response.json())).not.toContain("Secret");
      // Two reads happen before the save (cache check, then the check after the lease is won); none after the refused save.
      expect(names(d).filter(name => name === "read_content_translation_slots")).toHaveLength(2); expect(names(d)).toContain("release_content_translation_lease");
    });
    it("R10 returns 404 when the re-read after saving is refused", async () => {
      const d = dependencies(); let reads = 0;
      wire(d, { read_content_translation_slots: () => { if (++reads === 1) return null; throw new Error("FAN_WEB_NOT_FOUND"); } });
      d.translateTexts.mockResolvedValue([{ translatedText: "Secret title" }, { translatedText: "Secret body" }]);
      const response = await createContentHandlers(d).translate(request("POST", body));
      expect(response.status).toBe(404); expect(JSON.stringify(await response.json())).not.toContain("Secret");
    });
    it("R11 returns 409 when the re-read after saving finds nothing", async () => {
      const d = dependencies(); wire(d); d.translateTexts.mockResolvedValue([{ translatedText: "Title" }, { translatedText: "Body" }]);
      expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(409);
    });
    it("R12 serves nothing, not even a cached row, for a target the viewer may not read", async () => {
      const d = dependencies(); wire(d, { fan_web_content_target: null, read_content_translation_slots: stored({ title: "Title", article: "Body" }) });
      expect((await createContentHandlers(d).translate(request("POST", body))).status).toBe(404);
      expect(names(d)).not.toContain("read_content_translation_slots"); expect(d.translateTexts).not.toHaveBeenCalled();
      const denied = dependencies(); wire(denied, { read_content_translation_slots: () => { throw new Error("FAN_WEB_NOT_FOUND"); } });
      expect((await createContentHandlers(denied).translate(request("POST", body))).status).toBe(404);
      expect(denied.translateTexts).not.toHaveBeenCalled();
    });
    it("keeps the whole-text request and answer unchanged without slots", async () => {
      const d = dependencies(); d.rpc.mockResolvedValue({ targetType: "fan_post", targetId: id, targetLocale: "en", translatedText: "Hello", sourceRevision: 1, cached: true });
      const response = await createContentHandlers(d).translate(request("POST", { targetType: "fan_post", targetId: id, targetLocale: "en" }));
      expect(response.status).toBe(200); expect(d.rpc).toHaveBeenCalledWith("read_content_translation", { ...slotArgs });
      expect((await createContentHandlers(d).translate(request("POST", { ...body, slots: "other" }))).status).toBe(400);
    });
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

describe("granted point result on post and comment creation", () => {
  const create = { body: "hi", visibility: "public", assetIds: [], idempotencyKey: id };
  const comment = { body: "nice", parentId: null, idempotencyKey: id };
  function rpcBy(write: unknown, read: () => unknown) {
    const d = dependencies();
    d.rpc.mockImplementation(async (name: string) => (name === "read_owned_fan_post_reward" ? read() : write));
    return d;
  }
  it("adds the server-confirmed positive amount for a new post and calls the read with the actor and written id", async () => {
    const d = rpcBy({ id, revision: 1, replayed: false }, () => ({ amount: 10 }));
    const response = await createContentHandlers(d).posts(request("POST", create), "artist");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: false, reward: { points: 10, stamps: 0 } });
    expect(d.rpc).toHaveBeenLastCalledWith("read_owned_fan_post_reward", { p_app_user_id: owner, p_source_id: id });
  });
  it("forwards parentId so a reply is stored under its parent", async () => {
    const d = rpcBy({ id, revision: 1, replayed: false }, () => null), parent = "92820000-0000-4000-8000-0000000000aa";
    const response = await createContentHandlers(d).comments(request("POST", { ...comment, parentId: parent }), id);
    expect(response.status).toBe(201);
    expect(d.rpc).toHaveBeenCalledWith("post_fan_post_comment", { p_app_user_id: owner, p_post_id: id, p_parent_id: parent, p_body: "nice", p_idempotency_key: id });
  });
  it("adds the amount for a new comment", async () => {
    const d = rpcBy({ id, revision: 1, replayed: false }, () => ({ amount: 10 }));
    const response = await createContentHandlers(d).comments(request("POST", comment), id);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: false, reward: { points: 10, stamps: 0 } });
  });
  it.each([[{ amount: 0 }], [{ amount: -5 }], [{ amount: 1.5 }], [{ amount: 10, extra: 1 }], [null], ["x"]])("omits reward for non-granted or malformed read %j", async (read) => {
    const d = rpcBy({ id, revision: 1, replayed: false }, () => read);
    const response = await createContentHandlers(d).comments(request("POST", comment), id);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: false });
  });
  it.each([["posts"], ["comments"]] as const)("returns 201 without reward when the %s reward read never answers within the time limit", async (kind) => {
    const d = dependencies();
    d.rpc.mockImplementation((name: string) => (name === "read_owned_fan_post_reward" ? new Promise(() => {}) : Promise.resolve({ id, revision: 1, replayed: false })));
    const started = Date.now();
    const handlers = createContentHandlers(d);
    const response = kind === "posts" ? await handlers.posts(request("POST", create), "artist") : await handlers.comments(request("POST", comment), id);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: false });
  });
  it("keeps the committed write successful when the reward read throws", async () => {
    const d = rpcBy({ id, revision: 1, replayed: false }, () => { throw new Error("db down"); });
    const response = await createContentHandlers(d).posts(request("POST", create), "artist");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: false });
  });
  it("never reads or replays a reward for an idempotent replay", async () => {
    const d = rpcBy({ id, revision: 1, replayed: true }, () => ({ amount: 10 }));
    const response = await createContentHandlers(d).comments(request("POST", comment), id);
    expect(await response.json()).toEqual({ id, revision: 1, replayed: true });
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not read a reward when the write itself fails", async () => {
    const d = dependencies(); d.rpc.mockRejectedValue(new Error("FAN_WEB_NOT_FOUND"));
    const response = await createContentHandlers(d).comments(request("POST", comment), id);
    expect(response.status).toBe(404);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not read a reward for an edit", async () => {
    const d = dependencies();
    d.rpc.mockResolvedValueOnce({ post }).mockResolvedValue({ id, revision: 2, replayed: false });
    await createContentHandlers(d).post(request("PATCH", { body: "edit", visibility: "public", assetIds: [], expectedRevision: 1 }), id);
    expect(d.rpc).not.toHaveBeenCalledWith("read_owned_fan_post_reward", expect.anything());
  });
});
describe("account-unavailable versus non-member failure codes", () => {
  const body = async (response: Response) => (await response.json()) as { error: { code: string } };
  it("answers an unavailable account (AuthError 403) with the active-account code, keeping status 403", async () => {
    const response = contentFailure(new AuthError("AUTHENTICATION_REQUIRED", 403, "Account is unavailable"));
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe("FAN_WEB_ACTIVE_ACCOUNT_REQUIRED");
  });
  it("keeps 401 as AUTHENTICATION_REQUIRED", async () => {
    const response = contentFailure(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe("AUTHENTICATION_REQUIRED");
  });
  it("still answers the non-member RPC error with FAN_WEB_FORBIDDEN", async () => {
    const response = contentFailure(new Error("FAN_WEB_FORBIDDEN"));
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe("FAN_WEB_FORBIDDEN");
  });
  it("returns the active-account code from the attachment policy route when the session is unavailable", async () => {
    const d = dependencies(); d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 403, "Account is unavailable"));
    const response = await createContentHandlers(d).attachmentPolicy(request("GET"), "fan");
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe("FAN_WEB_ACTIVE_ACCOUNT_REQUIRED");
    expect(d.rpc).not.toHaveBeenCalled();
  });
  describe("rich board body", () => {
    const asset = "30000000-0000-4000-8000-000000000001", idempotencyKey = "40000000-0000-4000-8000-000000000001";
    const bodyDoc = { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "alert(1)" }, content: [{ type: "text", text: "본문", marks: [{ type: "bold" }] }] }, { type: "attachment", attrs: { assetId: asset, kind: "image", src: "https://evil.example/a.png" } }] };
    const clean = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문", marks: [{ type: "bold" }] }] }, { type: "attachment", attrs: { assetId: asset, kind: "image" } }] };
    const written = { id, revision: 1, replayed: false };
    const create = (input: Record<string, unknown>) => request("POST", { body: "제목\n클라이언트가 보낸 글", visibility: "public", assetIds: [asset], idempotencyKey, ...input });

    it("stores the sanitized document and derives the plain body on the server", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockResolvedValue(written);
      expect((await h.posts(create({ bodyDoc }), "artist")).status).toBe(201);
      expect(d.rpc).toHaveBeenCalledWith("save_fan_post_rich", expect.objectContaining({ p_app_user_id: owner, p_body: "제목\n본문", p_asset_ids: [asset], p_body_doc: clean }));
    });

    it.each([
      ["script node", { type: "doc", content: [{ type: "script", content: [{ type: "text", text: "alert(1)" }] }] }],
      ["javascript link", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }],
      ["image by address", { type: "doc", content: [{ type: "image", attrs: { src: "https://evil.example/a.png", alt: "a" } }] }],
      ["media of another post", { type: "doc", content: [{ type: "attachment", attrs: { assetId: "50000000-0000-4000-8000-000000000001", kind: "image" } }] }],
    ])("refuses %s without writing", async (_name, input) => {
      const d = dependencies(), h = createContentHandlers(d);
      expect((await h.posts(create({ bodyDoc: input }), "artist")).status).toBe(400);
      expect(d.rpc).not.toHaveBeenCalled();
    });

    it("keeps the plain path for clients that send no document", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockResolvedValue(written);
      expect((await h.posts(create({}), "artist")).status).toBe(201);
      expect(d.rpc).toHaveBeenCalledWith("save_fan_post", expect.objectContaining({ p_body: "제목\n클라이언트가 보낸 글", p_asset_ids: [asset] }));
      expect(d.rpc.mock.calls.flat()).not.toContain("save_fan_post_rich");
    });

    it("does not accept a document for the wave board", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      expect((await h.posts(create({ bodyDoc }), "kyaa-wave-fanpage")).status).toBe(400);
      expect(d.rpc).not.toHaveBeenCalled();
    });

    it("sends the document only to a reader that asks for it", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post: { ...post, body: "제목\n본문", assets: [{ id: asset, width: 10, height: 10 }] } } : clean);
      const plain = await (await h.post(request("GET", undefined, `https://byus.test/api/posts/${id}`), id)).json();
      expect(plain.post.bodyDoc).toBeUndefined();
      expect(d.rpc.mock.calls.map(call => call[0])).not.toContain("read_fan_post_body_doc");
      const rich = await (await h.post(request("GET", undefined, `https://byus.test/api/posts/${id}?format=rich`), id)).json();
      expect(rich.post.bodyDoc).toEqual(clean);
    });

    it("M1: tells a failed or unreadable document apart from a post that has none", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      const read = async () => (await (await h.post(request("GET", undefined, `https://byus.test/api/posts/${id}?format=rich`), id)).json()).post;
      d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post } : { type: "doc", content: [{ type: "script" }] });
      expect(await read()).toMatchObject({ body: post.body, bodyDocUnavailable: true });
      expect((await read()).bodyDoc).toBeUndefined();
      d.rpc.mockImplementation(async (name: string) => { if (name === "read_fan_post") return { post }; throw new Error("temporary"); });
      const response = await h.post(request("GET", undefined, `https://byus.test/api/posts/${id}?format=rich`), id);
      expect(response.status).toBe(200);
      expect((await response.json()).post).toMatchObject({ body: post.body, bodyDocUnavailable: true });
      d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post } : null);
      const none = await read();
      expect(none.bodyDoc).toBeUndefined();
      expect(none.bodyDocUnavailable).toBeUndefined();
    });

    it("M1: a reader that did not ask for the document never sees the flag", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockImplementation(async (name: string) => { if (name === "read_fan_post") return { post }; throw new Error("temporary"); });
      expect((await (await h.post(request("GET", undefined, `https://byus.test/api/posts/${id}`), id)).json()).post.bodyDocUnavailable).toBeUndefined();
    });

    it("M2: takes the title from the request and every other line from the document", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockResolvedValue(written);
      expect((await h.posts(create({ body: "제목", bodyDoc }), "artist")).status).toBe(201);
      expect(d.rpc).toHaveBeenCalledWith("save_fan_post_rich", expect.objectContaining({ p_body: "제목\n본문" }));
    });

    it("M2: accepts a formatted post at the 5,000 character limit", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockResolvedValue(written);
      const line = "가".repeat(39), long = { type: "doc", content: Array.from({ length: 124 }, () => ({ type: "paragraph", content: [{ type: "text", text: line, marks: [{ type: "bold" }] }] })) };
      expect((await h.posts(create({ body: "제목", assetIds: [], bodyDoc: long }), "artist")).status).toBe(201);
    });

    it("keeps a document through a plain edit: the read follows the new text and keeps untouched formatting", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      const stored = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "그대로", marks: [{ type: "bold" }] }] }, { type: "paragraph", content: [{ type: "text", text: "고칠 줄" }] }] };
      d.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post: { ...post, body: "제목\n그대로\n고친 줄", revision: 2 } } : name === "read_fan_post_body_doc" ? stored : written);
      const read = await (await h.post(request("GET", undefined, `https://byus.test/api/posts/${id}?format=rich`), id)).json();
      expect(read.post.bodyDoc.content[0].content[0].marks).toEqual([{ type: "bold" }]);
      expect(read.post.bodyDoc.content[1].content[0].text).toBe("고친 줄");
      d.rpc.mockClear();
      expect((await h.post(request("PATCH", { body: "제목\n그대로\n또 고침", visibility: "public", assetIds: [], expectedRevision: 2 }, `https://byus.test/api/posts/${id}`), id)).status).toBe(200);
      expect(d.rpc).toHaveBeenCalledWith("save_fan_post", expect.objectContaining({ p_body: "제목\n그대로\n또 고침" }));
      expect(d.rpc.mock.calls.map(call => call[0])).not.toContain("save_fan_post_rich");
    });

    it("refuses an edit by someone other than the author before writing", async () => {
      const d = dependencies(), h = createContentHandlers(d);
      d.rpc.mockResolvedValue({ post: { ...post, isOwner: false } });
      const response = await h.post(request("PATCH", { body: "제목", visibility: "public", assetIds: [asset], expectedRevision: 1, bodyDoc }, `https://byus.test/api/posts/${id}`), id);
      expect(response.status).toBe(404);
      expect(d.rpc.mock.calls.map(call => call[0])).toEqual(["read_fan_post"]);
    });
  });
});

// 261107-2 D6 / review r4: every mission write answers the one reward shape { points, stamps, skippedReason? }.
describe("mission reward shape on posts", () => {
  const owner = "11111111-1111-4111-8111-111111111111", postId = "22222222-2222-4222-8222-222222222222";
  const deps = (award: unknown) => ({
    rpc: vi.fn(async (name: string) => name === "save_fan_post" ? { id: postId, revision: 1, replayed: false }
      : name === "record_dukjil_action" ? (award instanceof Error ? Promise.reject(award) : award) : name === "read_owned_fan_post_reward" ? { amount: 0 } : null),
    resolveCreatorId: async () => "33333333-3333-4333-8333-333333333333",
  });
  it.each([
    [{ points: 20, stampId: "44444444-4444-4444-8444-444444444444", capped: false, reason: null, replayed: false }, { points: 20, stamps: 1 }],
    [new Error("DUKJIL_CONTENT_TOO_SHORT"), { points: 0, stamps: 0, skippedReason: "too_short" }],
    [new Error("DUKJIL_DAILY_LIMIT"), { points: 0, stamps: 0, skippedReason: "daily_limit" }],
  ])("answers %o as %o", async (award, reward) => {
    const { missionRewardForTest } = await import("./routes");
    const d = deps(award);
    const { awardDukjilActionDetailed } = await import("@/server/dukjil/award");
    const detailed = await awardDukjilActionDetailed(d, { appUserId: owner, creatorSlug: "elina", actionKey: "post", sourceKey: postId, params: {} }, () => {});
    expect(await missionRewardForTest(d, owner, { id: postId, revision: 1, replayed: false }, detailed)).toEqual({ reward });
  });
});
