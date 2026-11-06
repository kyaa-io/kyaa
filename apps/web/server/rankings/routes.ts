import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import {
  PAGE_RANKING_METRICS, RANKING_PERIODS, creatorRankingSchema, jjinfanChallengeSchema, pageRankingSchema,
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
    return authorization ? (await deps.authorize(authorization)).appUserId : null;
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
  const celebrity = async (idOrSlug: string) => {
    if (UUID.test(idOrSlug)) return idOrSlug;
    const id = await deps.resolveCreatorId(creatorSlugSchema.parse(idOrSlug));
    if (!id) throw new Error("CREATOR_NOT_FOUND");
    return id;
  };

  return {
    creators: (request: Request) => run(async () => {
      const p = period(request);
      const locale = z.string().regex(/^[A-Za-z-]{2,12}$/).parse(one(request, "locale") ?? "ko");
      const appUserId = await viewer(request);
      const raw = obj(await readFresh("read_creator_ranking", { p_period: p, p_viewer: appUserId, p_locale: locale }));
      const rows = arr(raw.rows).map((row) => {
        const r = obj(row);
        return { rank: r.rank, slug: r.slug, name: r.name, imageUrl: r.imageUrl ?? null, score: r.score, jjinfanCount: r.jjinfanCount, myHearts: appUserId ? (r.myHearts ?? 0) : null };
      });
      const body = checked(creatorRankingSchema, { period: p, periodStart: raw.periodStart, computedAt: raw.computedAt ?? null, rows });
      return Response.json(body, { headers: appUserId ? privateHeaders : publicHeaders });
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
      return Response.json(body, { headers: appUserId ? privateHeaders : publicHeaders });
    }),
    challenge: (_request: Request, idOrSlug: string) => run(async () => {
      const id = await celebrity(idOrSlug);
      const raw = await deps.rpc("read_jjinfan_challenge", { p_celebrity: id });
      return Response.json(checked(jjinfanChallengeSchema, raw), { headers: publicHeaders });
    }),
  };
}
