import { createPostSchema, postSchema, type FanPost } from "@/features/fan-posts/domain/content";
import { feedPageSchema } from "@/features/fan-posts/domain/feed";
import { fanCommunitySchema } from "@/features/fanpage/domain/fan-community";
import { gggiEventSchema } from "@/features/fanpage/domain/gggi-event";
import { cheerEventRewardsResponseSchema } from "@/features/fanpage/domain/cheer-event";
import { reactionResultSchema, type ReactionResult } from "@/features/reaction/domain/reaction";
import draft from "../../../../content/gggi/celebrity.json";

const storageKey = "gggi-local-participation-v1";
const avatar = "/images/avatars/star-pink.webp";
type LocalState = { enteredAt: string | null; reaction: ReactionResult | null; posts: FanPost[]; postKeys: Record<string, string> };
const empty = (): LocalState => ({ enteredAt: null, reaction: null, posts: [], postKeys: {} });
function readState(): LocalState {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!data) return empty();
    return { enteredAt: typeof data.enteredAt === "string" ? data.enteredAt : null, reaction: data.reaction ? reactionResultSchema.parse(data.reaction) : null, posts: data.posts.map((post: unknown) => postSchema.parse(post)), postKeys: data.postKeys };
  } catch { return empty(); }
}

export function installLocalApi() {
  const original = window.fetch.bind(window);
  let state = readState();
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  window.fetch = async (input, init) => {
    const request = new Request(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin), init);
    const url = new URL(request.url), method = request.method;
    if (url.origin !== location.origin) throw new Error("GGGI local preview blocks external fetches");
    if (!url.pathname.startsWith("/api/")) return original(input, init);
    const json = (body: unknown, status = 200) => Response.json(body, { status });
    const fail = (code: string, status: number) => json({ error: { code } }, status);
    const authenticated = request.headers.get("authorization") === "Bearer gggi-loopback-fan";
    if (url.pathname === "/api/events" && method === "POST") return json({ accepted: true });
    if (url.pathname === "/api/display-translations" && method === "POST") {
      const body = await request.json();
      return json(Array.isArray(body.texts)
        ? { translatedTexts: body.texts.map(() => "로컬 번역 안내"), cached: false }
        : { translatedText: "로컬 번역 안내", cached: false });
    }
    if (method !== "GET" && !authenticated) return fail("AUTHENTICATION_REQUIRED", 401);
    if (url.pathname === "/api/local/gggi/reset" && method === "POST") { state = empty(); save(); return json({ reset: true }); }
    if (url.pathname === "/api/celebrities/gggi/event-entry") {
      const previewStatus = new URLSearchParams(location.search).get("eventState");
      const status = previewStatus === "draft" || previewStatus === "closed" ? previewStatus : "open";
      if (method === "POST") {
        if (request.body !== null) return fail("INVALID_REQUEST", 400);
        if (!state.enteredAt) {
          if (status !== "open") return fail("GGGI_EVENT_CLOSED", 409);
          if (!state.reaction) return fail("GGGI_EVENT_LIKE_REQUIRED", 409);
          state.enteredAt = new Date().toISOString(); save();
        }
      }
      return json(gggiEventSchema.parse({ eventKey: "gggi-goods-2026", status,
        participation: authenticated ? { liked: state.reaction !== null, enteredAt: state.enteredAt } : null }));
    }
    if (url.pathname === "/api/celebrities/gggi/reactions") {
      if (method === "GET") return json({ reaction: authenticated ? state.reaction : null });
      if (method === "POST") {
        const created = !state.reaction;
        state.reaction ??= reactionResultSchema.parse({ reactionId: crypto.randomUUID(), status: "completed", mintStatus: "queued", blockchainJobId: null, created: true, passportExists: false });
        save(); return json({ ...state.reaction, created });
      }
    }
    if (url.pathname === "/api/celebrities/gggi/posts" && method === "POST") {
      const parsed = createPostSchema.safeParse(await request.json());
      if (!parsed.success) return fail("FAN_WEB_INVALID_INPUT", 400);
      const value = parsed.data;
      if (value.visibility !== "public" || value.assetIds.length) return fail("LOCAL_TEXT_POSTS_ONLY", 400);
      const previous = state.posts.find(post => post.id === state.postKeys[value.idempotencyKey]);
      if (previous) return previous.body === value.body ? json({ id: previous.id, revision: previous.revision, replayed: true }, 201) : fail("IDEMPOTENCY_CONFLICT", 409);
      const now = new Date().toISOString();
      const post = postSchema.parse({ id: crypto.randomUUID(), celebritySlug: "gggi", body: value.body, visibility: "public", revision: 1, author: { nickname: "GreenFan", avatarUrl: avatar }, assets: [], createdAt: now, updatedAt: now, isOwner: true, likeCount: 0, liked: false, commentCount: 0 });
      state.posts.unshift(post); state.postKeys[value.idempotencyKey] = post.id; save();
      return json({ id: post.id, revision: 1, replayed: false }, 201);
    }
    if (method === "GET") {
      if (url.pathname === "/api/celebrities/gggi/cheer-event") return json(cheerEventRewardsResponseSchema.parse({ event: null }));
      if (url.pathname === "/api/celebrities/gggi/feed") return json(feedPageSchema.parse({ items: url.searchParams.get("source") === "official" ? [] : state.posts.map(post => ({ ...post, isOwner: authenticated, kind: "fan_post" })), nextCursor: null, unavailableSources: [] }));
      if (url.pathname === "/api/celebrities/gggi/fans") return json(fanCommunitySchema.parse({ likeCount: state.reaction ? 1 : 0, fanCount: draft.payload.fanCount, publicFanCount: 0, fans: [] }));
      if (/^\/api\/(?:public\/)?celebrities\/gggi\/notices$/.test(url.pathname)) return json({ notices: [], nextCursor: null });
      if (url.pathname === "/api/celebrities/gggi/raffles") return json({ raffles: [] });
      if (url.pathname === "/api/schedules") return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/community-stamps") return json({ stamps: [], today: new Date().toISOString().slice(0, 10) });
      if (url.pathname === "/api/celebrities/gggi/fanpage") return json({ membershipCount: state.reaction ? 1 : 0, fanCount: draft.payload.fanCount, leaderboardAvailable: false, activity: [] });
      if (url.pathname === "/api/celebrities/gggi/leaderboard") return json({ error: { code: "LEADERBOARD_NOT_AVAILABLE" }, membershipCount: state.reaction ? 1 : 0, fanCount: draft.payload.fanCount }, 403);
      if (url.pathname === "/api/live-events/calendar") {
        const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
        const [year, number] = month.split("-").map(Number);
        return json({ month, timeZone: "Asia/Seoul", days: Array.from({ length: new Date(Date.UTC(year, number, 0)).getUTCDate() }, (_, index) => ({ date: `${month}-${String(index + 1).padStart(2, "0")}`, events: [] })) });
      }
      if (url.pathname === "/api/me/summary") return json({ summary: { profile: { nickname: "GreenFan" }, creators: [], live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 0, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 } });
      if (url.pathname === "/api/me/avatar") return json({ avatar: { initialCharacterId: "star-pink", characterId: "star-pink", source: "character", hasImage: false, revision: 0 } });
      if (url.pathname === "/api/me/fan-activity-visibility") return json({ enabled: false });
    }
    console.warn("GGGI_LOCAL_UNHANDLED_API", method, url.pathname);
    return fail("LOCAL_FIXTURE_NOT_IMPLEMENTED", 501);
  };
}
