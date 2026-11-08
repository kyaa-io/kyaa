import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import {
  HOME_RANKING_LIMIT, PAGE_RANKING_METRICS, RANKING_PERIODS, activeJjinfanChallengesSchema, creatorRankingSchema, homeCreatorRankingSchema, homeFanRankingSchema,
  jjinfanChallengeSchema, pageRankingSchema, platformFanRankingSchema,
} from "@/features/rankings/domain/types";
import { creatorSlugSchema } from "@/features/passport/domain/dukjil-types";

export interface RankingsDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  resolveCreatorId(slug: string): Promise<string | null>;
  /** Development only: rebuild the snapshots from a read when they are older than REFRESH_AFTER_MS. Production leaves this off and relies on a scheduler. */
  refreshOnRead?: boolean;
  now?: () => number;
}

export const REFRESH_AFTER_MS = 5 * 60 * 1000;
const publicHeaders = { "cache-control": "public, max-age=60, stale-while-revalidate=300" };
const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUS: Record<string, number> = { RANKING_PERIOD_INVALID: 400, CREATOR_NOT_FOUND: 404 };

export function rankingFailure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN" } }, { status: error.status, headers: privateHeaders });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: privateHeaders });
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find((known) => message.includes(known));
  if (code) return Response.json({ error: { code } }, { status: STATUS[code], headers: privateHeaders });
  return Response.json({ error: { code: "RANKING_UNAVAILABLE" } }, { status: 503, headers: privateHeaders });
}

function one(request: Request, key: string) {
  const values = new URL(request.url).searchParams.getAll(key);
  if (values.length > 1) throw new SyntaxError("duplicate query");
  return values[0] ?? null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The fan row's favorite comes with its name in every stored language; keep the viewer's, then Korean, then English, then the slug. */
function favoriteIn(value: unknown, lang: string) {
  const f = obj(value);
  if (typeof f.slug !== "string") return null;
  const names = obj(f.names);
  const name = [names[lang], names.ko, names.en].find((n): n is string => typeof n === "string" && n.trim() !== "");
  return { slug: f.slug, name: name ?? f.slug };
}

export function createRankingsHandlers(deps: RankingsDependencies) {
  const now = deps.now ?? Date.now;
  let lastRefreshAt = 0;
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return rankingFailure(error); } };
  const checked = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new Error("RANKING_UNAVAILABLE");
    return parsed.data;
  };
  const period = (request: Request) => z.enum(RANKING_PERIODS).parse(one(request, "period") ?? "week");
  // A viewer is optional: without an Authorization header the ranking is public and cacheable; with one it also carries "my" values.
  const viewer = async (request: Request) => {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;
    // A token that is expired or not yet accepted must not turn a public ranking into an error: answer as a signed-out reader.
    try { return (await deps.authorize(authorization)).appUserId; }
    catch (error) { if (error instanceof AuthError && error.status === 401) return null; throw error; }
  };
  const stale = (raw: unknown) => {
    const at = obj(raw).computedAt;
    return typeof at !== "string" || now() - Date.parse(at) > REFRESH_AFTER_MS;
  };
  // Dev only. A period with no scores has no snapshot (computedAt null), so a per-process throttle keeps an empty ranking from refreshing on every read.
  const readFresh = async (name: string, args: Record<string, unknown>) => {
    const raw = await deps.rpc(name, args);
    if (!deps.refreshOnRead || !stale(raw) || now() - lastRefreshAt < REFRESH_AFTER_MS) return raw;
    lastRefreshAt = now();
    await deps.rpc("refresh_ranking_snapshots", {});
    return deps.rpc(name, args);
  };
  // Home day table (decision 2026-11-08 08:25): every environment builds the day on read. An answer not from today (KST) asks the database to build
  // today once (it locks and checks again, so concurrent first readers build once) and is read again. Later reads of the day only read.
  const kstDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now()));
  const readHome = async (name: string, args: Record<string, unknown>) => {
    const raw = await deps.rpc(name, args);
    if (obj(raw).builtDay === kstDay()) return raw;
    await deps.rpc("ensure_home_rankings", {});
    return deps.rpc(name, args);
  };
  const locale = (request: Request) => z.string().regex(/^[A-Za-z-]{2,12}$/).parse(one(request, "locale") ?? "ko");
  const celebrity = async (idOrSlug: string) => {
    if (UUID.test(idOrSlug)) return idOrSlug;
    const id = await deps.resolveCreatorId(creatorSlugSchema.parse(idOrSlug));
    if (!id) throw new Error("CREATOR_NOT_FOUND");
    return id;
  };

  return {
    creators: (request: Request) => run(async () => {
      const p = period(request);
      // metric=fans: creators by fan count (home card, D3). The count has no period and no viewer value; the answer keeps the same shape.
      if (z.enum(["hearts", "fans"]).parse(one(request, "metric") ?? "hearts") === "fans") {
        const limit = z.coerce.number().int().min(1).max(50).parse(one(request, "limit") ?? "10");
        const fans = obj(await deps.rpc("read_creator_fan_ranking", { p_locale: locale(request), p_limit: limit }));
        const rows = arr(fans.rows).map((row) => {
          const r = obj(row);
          return { rank: r.rank, slug: r.slug, name: r.name, imageUrl: r.imageUrl ?? null, score: r.score, jjinfanCount: r.jjinfanCount, myHearts: null };
        });
        const body = checked(creatorRankingSchema, { period: p, periodStart: "1970-01-01", computedAt: null, rows });
        return Response.json({ ...body, metric: "fans" }, { headers: publicHeaders });
      }
      const appUserId = await viewer(request);
      const raw = obj(await readFresh("read_creator_ranking", { p_period: p, p_viewer: appUserId, p_locale: locale(request) }));
      const rows = arr(raw.rows).map((row) => {
        const r = obj(row);
        return { rank: r.rank, slug: r.slug, name: r.name, imageUrl: r.imageUrl ?? null, score: r.score, jjinfanCount: r.jjinfanCount, myHearts: appUserId ? (r.myHearts ?? 0) : null };
      });
      const body = checked(creatorRankingSchema, { period: p, periodStart: raw.periodStart, computedAt: raw.computedAt ?? null, rows });
      return Response.json(body, { headers: appUserId || request.headers.has("authorization") ? privateHeaders : publicHeaders });
    }),
    // Platform top fans across every creator. Rows are rebuilt from named fields so a new database key never reaches the client.
    fans: (request: Request) => run(async () => {
      const p = period(request);
      const limit = z.coerce.number().int().min(1).max(50).parse(one(request, "limit") ?? "10");
      const appUserId = await viewer(request);
      const raw = obj(await readFresh("read_platform_fan_ranking", { p_period: p, p_viewer: appUserId, p_limit: limit }));
      const me = obj(raw.me);
      const rows = arr(raw.rows).map((row) => {
        const r = obj(row);
        return { rank: r.rank, score: r.score, nickname: r.nickname, characterId: r.characterId, tier: r.tier ?? null, isMe: appUserId !== null && r.isMe === true };
      });
      const body = checked(platformFanRankingSchema, {
        period: p, periodStart: raw.periodStart, computedAt: raw.computedAt ?? null, rows,
        me: appUserId && raw.me ? { rank: me.rank, score: me.score, inTop: me.inTop === true } : null,
      });
      return Response.json(body, { headers: appUserId || request.headers.has("authorization") ? privateHeaders : publicHeaders });
    }),
    page: (request: Request, idOrSlug: string) => run(async () => {
      const p = period(request);
      const metric = z.enum(PAGE_RANKING_METRICS).parse(one(request, "metric") ?? "hearts");
      const appUserId = await viewer(request);
      const id = await celebrity(idOrSlug);
      const raw = obj(await readFresh("read_page_ranking", {
        p_celebrity: id, p_kind: metric === "hearts" ? "fan_contribution" : "dukjil", p_period: p, p_viewer: appUserId,
      }));
      const me = obj(raw.me);
      // Fan ids stay on the server: the public rows carry only rank, score, nickname, avatar and whether the row is the viewer.
      const rows = arr(raw.rows).map((row) => {
        const r = obj(row);
        return { rank: r.rank, score: r.score, nickname: r.nickname, characterId: r.characterId, isMe: appUserId !== null && r.subjectId === appUserId };
      });
      const body = checked(pageRankingSchema, {
        metric, period: p, periodStart: raw.periodStart, computedAt: raw.computedAt ?? null, rows,
        me: raw.me ? { rank: me.rank, score: me.score, inTop: me.inTop === true } : null,
        ...(raw.available === false ? { available: false } : {}),
      });
      return Response.json(body, { headers: appUserId || request.headers.has("authorization") ? privateHeaders : publicHeaders });
    }),
    // Home card by day (C3): fans by hearts, creators by fans holding hearts. 1 to 20, movement against yesterday. Member ids stay on the server.
    home: (request: Request) => run(async () => {
      const kind = z.enum(["fans", "creators"]).parse(one(request, "kind") ?? "fans");
      const limit = z.coerce.number().int().min(1).max(HOME_RANKING_LIMIT).parse(one(request, "limit") ?? String(HOME_RANKING_LIMIT));
      if (kind === "creators") {
        const raw = obj(await readHome("read_home_creator_ranking", { p_locale: locale(request), p_limit: limit }));
        const rows = arr(raw.rows).map((row) => {
          const r = obj(row);
          return { rank: r.rank, slug: r.slug, name: r.name, imageUrl: r.imageUrl ?? null, score: r.score, hearts: r.hearts, challenge: r.challenge === true, delta: r.delta ?? null, weekGain: r.weekGain ?? null };
        });
        return Response.json(checked(homeCreatorRankingSchema, {
          day: raw.day ?? null, computedAt: raw.computedAt ?? null, comparable: raw.comparable === true, weekGainDays: raw.weekGainDays ?? null, rows,
        }), { headers: publicHeaders });
      }
      const lang = locale(request);
      const appUserId = await viewer(request);
      const raw = obj(await readHome("read_home_fan_ranking", { p_viewer: appUserId, p_limit: limit }));
      const me = obj(raw.me);
      const rows = arr(raw.rows).map((row) => {
        const r = obj(row);
        return { rank: r.rank, score: r.score, nickname: r.nickname, characterId: r.characterId, tier: r.tier ?? null, isMe: appUserId !== null && r.isMe === true, delta: r.delta ?? null, favorite: favoriteIn(r.favorite, lang) };
      });
      const body = checked(homeFanRankingSchema, {
        day: raw.day ?? null, computedAt: raw.computedAt ?? null, comparable: raw.comparable === true, rows,
        me: appUserId && raw.me ? { rank: me.rank, score: me.score, inTop: me.inTop === true } : null,
      });
      return Response.json(body, { headers: appUserId ? privateHeaders : publicHeaders });
    }),
    // 찐팬 100 challenges switched on (C7): home module, card tags. Public and the same for everyone.
    challenges: (request: Request) => run(async () => {
      const raw = obj(await deps.rpc("read_active_jjinfan_challenges", { p_locale: locale(request), p_limit: 10 }));
      const items = arr(raw.items).map((item) => {
        const r = obj(item);
        return { slug: r.slug, name: r.name, imageUrl: r.imageUrl ?? null, title: r.title, description: r.description ?? "", endsOn: r.endsOn ?? null, count: r.count, target: r.target };
      });
      return Response.json(checked(activeJjinfanChallengesSchema, { items }), { headers: publicHeaders });
    }),
    challenge: (_request: Request, idOrSlug: string) => run(async () => {
      const id = await celebrity(idOrSlug);
      const raw = await deps.rpc("read_jjinfan_gauge", { p_celebrity: id });
      return Response.json(checked(jjinfanChallengeSchema, raw), { headers: publicHeaders });
    }),
  };
}
