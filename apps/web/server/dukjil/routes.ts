import "server-only";
import { kstMidnightAfter } from "@/server/kst-midnight";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import {
  DUKJIL_ATTENDANCE_MAX_CREATORS, attendanceRequestSchema, attendanceResultSchema, dukjilAttendanceListSchema, creatorSlugSchema, dukjilCatalogResponseSchema, dukjilTodaySchema,
} from "@/features/passport/domain/dukjil-types";
import { resolveCreatorId, resolveCreatorIds } from "./creator-id";
import { boundedJson, CertificationBodyError } from "@/server/certification/certification-http";

export interface DukjilDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  resolveCreatorId?(slug: string): Promise<string | null>;
  resolveCreatorIds?(slugs: string[]): Promise<Map<string, string>>;
  resolveOwnedPassportCreator?(passportId: string, appUserId: string): Promise<string | null>;
}

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const publicHeaders = { "cache-control": "public, max-age=60, stale-while-revalidate=300" };

const STATUS: Record<string, number> = {
  DUKJIL_DAILY_LIMIT: 429, UNKNOWN_ACTION: 400, POLICY_INACTIVE: 409, PASSPORT_REQUIRED: 403, SOURCE_REUSED: 409,
  DUKJIL_CONTENT_TOO_SHORT: 422, DUKJIL_DUPLICATE_BODY: 409, DUKJIL_REPEAT_TARGET: 409, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, DUKJIL_PARAMS_INVALID: 400, DUKJIL_CELEBRITY_REQUIRED: 400, DUKJIL_ATTENDANCE_MOVED: 409,
  COMMUNITY_STAMP_WALLET_NOT_READY: 409, COMMUNITY_STAMP_NOT_FOUND: 404, GROUP_WALLET_REQUEST_CONFLICT: 409, GROUP_WALLET_INVALID: 400, CREATOR_NOT_FOUND: 404,
  PASSPORT_NOT_FOUND: 404, PASSPORT_PAGE_NOT_COMPLETE: 409, PASSPORT_CLAIM_LOCKED_UNTIL_JJINFAN: 403, STAMP_KIND_UNKNOWN: 400, STAMP_NOT_FOUND: 404, ALREADY_REVOKED: 409, ADMIN_REQUIRED: 403, DUKJIL_EFFECTIVE_FROM_INVALID: 400,
};

export function dukjilFailure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN" } }, { status: error.status, headers: privateHeaders });
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof CertificationBodyError) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: privateHeaders });
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find((known) => message.includes(known));
  if (code) return Response.json({ error: { code } }, { status: STATUS[code], headers: privateHeaders });
  return Response.json({ error: { code: "DUKJIL_UNAVAILABLE" } }, { status: 503, headers: privateHeaders });
}

function one(request: Request, key: string) {
  const values = new URL(request.url).searchParams.getAll(key);
  if (values.length > 1) throw new SyntaxError("duplicate query");
  return values[0] ?? null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined);

// DB shape { active, version, rules:{ actions:{ key:{ points|pointsMin, pointCap:{per,max}, stamp:{kind} ... } } }, missionBook }
// -> public shape { version, rules:{ key:{ points, dailyLimit, stamp } }, missionBook }. { active:false } or null -> the empty catalog.
export function adaptCatalog(raw: unknown) {
  const c = obj(raw);
  if (c.active !== true) return { version: null, rules: {}, missionBook: null };
  const rules: Record<string, Json> = {};
  for (const [key, value] of Object.entries(obj(obj(c.rules).actions))) {
    const r = obj(value), cap = obj(r.pointCap), stamp = obj(r.stamp);
    rules[key] = {
      ...r,
      points: int(r.points) ?? int(r.firstPoints) ?? int(r.pointsMin) ?? 0,
      dailyLimit: cap.per === "user_day" ? (int(cap.max) ?? null) : null,
      stamp: typeof stamp.kind === "string" ? stamp.kind : null,
    };
  }
  return { version: c.version, rules, missionBook: c.missionBook ?? null };
}

export function createDukjilHandlers(deps: DukjilDependencies) {
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return dukjilFailure(error); } };
  const checked = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new Error("DUKJIL_UNAVAILABLE");
    return parsed.data;
  };
  return {
    catalog: (request: Request) => run(async () => {
      z.string().regex(/^[A-Za-z-]{2,12}$/).parse(one(request, "locale") ?? "ko");
      // read_dukjil_catalog() takes no arguments and returns { active:false } or { active:true, version, rules:{ actions:{...} }, missionBook }.
      // The locale is validated but unused: translating rule text is a UI concern.
      const raw = await deps.rpc("read_dukjil_catalog", {});
      return Response.json(checked(dukjilCatalogResponseSchema, adaptCatalog(raw)), { headers: publicHeaders });
    }),
    today: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      // Contract §15: read_dukjil_today(p_user, p_celebrity) already returns the public shape; it is passed through unchanged.
      const slug = one(request, "creator");
      let celebrity: string | null = null;
      if (slug !== null) {
        celebrity = await (deps.resolveCreatorId ?? resolveCreatorId)(creatorSlugSchema.parse(slug));
        if (!celebrity) throw new Error("CREATOR_NOT_FOUND");
      }
      const raw = await deps.rpc("read_dukjil_today", { p_user: appUserId, p_celebrity: celebrity });
      const today = checked(dukjilTodaySchema, raw);
      const resetAt = kstMidnightAfter(today.kstDate);
      return Response.json(resetAt ? { ...today, resetAt } : today, { headers: privateHeaders });
    }),
    attendanceList: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const param = one(request, "creators");
      const requested = (param ?? "").split(",").filter((part) => part !== "");
      if (requested.length === 0 || requested.length > DUKJIL_ATTENDANCE_MAX_CREATORS) throw new SyntaxError("creators out of range");
      const slugs = [...new Set(requested.map((slug) => creatorSlugSchema.parse(slug)))];
      const ids = await (deps.resolveCreatorIds ?? resolveCreatorIds)(slugs);
      const byId = new Map<string, string>();
      for (const slug of slugs) { const id = ids.get(slug); if (id) byId.set(id, slug); }
      // Unknown slugs are left out of the result.
      const raw = obj(await deps.rpc("read_dukjil_attendance", { p_user: appUserId, p_celebrities: [...byId.keys()] }));
      const items = (Array.isArray(raw.items) ? raw.items : []).flatMap((item) => {
        const row = obj(item), creatorSlug = byId.get(String(row.celebrityId));
        return creatorSlug ? [{ ...row, creatorSlug }] : [];
      });
      return Response.json(checked(dukjilAttendanceListSchema, { kstDate: raw.kstDate, items }), { headers: privateHeaders });
    }),
    attend: (request: Request, creatorSlug: string) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const creator = creatorSlugSchema.parse(creatorSlug);
      const body = attendanceRequestSchema.parse(await boundedJson(request, 1024));
      const celebrity = await (deps.resolveCreatorId ?? resolveCreatorId)(creator);
      if (!celebrity) throw new Error("CREATOR_NOT_FOUND");
      const raw = await deps.rpc("attend_creator", { p_user: appUserId, p_celebrity: celebrity, p_request_key: body.requestKey });
      return Response.json(checked(attendanceResultSchema, raw), { headers: privateHeaders });
    }),
  };
}
