import "server-only";
import { z } from "zod";
import { homeNoticeCategories, type HomeNoticeErrorCode } from "@/features/home/domain/home-notice";
import { AuthError } from "../../features/auth/domain/auth-errors";
import type { AdminSession } from "../admin/admin-session-gate";
import { publicContentCacheHeaders } from "../cache/public-content-cache";
import { boundedJson, boundedMultipart, CertificationBodyError } from "../certification/certification-http";
import { MAX_PUBLIC_IMAGE_MULTIPART_BYTES } from "../media/public-image-processing";
import { noticeSlugSchema } from "../notice/notice-domain";
import type { HomeNoticeRepository } from "./home-notice-repository";
import { HomeNoticeRepositoryError } from "./home-notice-repository";

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });

const localization = z.object({ title: z.string().trim().min(1).max(160), body: z.record(z.string(), z.unknown()) }).strict();
const saveSchema = z.object({
  action: z.literal("save"),
  id: z.uuid().optional(),
  expectedRevision: z.number().int().positive().optional(),
  slug: noticeSlugSchema,
  category: z.enum(homeNoticeCategories),
  pinned: z.boolean(),
  localizations: z.object({ ko: localization, en: localization }).strict(),
}).strict();
const stateSchema = z.object({
  action: z.enum(["publish", "unpublish", "archive"]),
  id: z.uuid(),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(10).optional(),
}).strict();

export interface HomeNoticeAdminDependencies {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  repository: Pick<HomeNoticeRepository, "listAdmin" | "save" | "state">;
  registerImage(actor: AdminSession, correlationId: string, bytes: Uint8Array): Promise<{ url: string }>;
  invalidatePublicContent(): void;
}

function correlation(request: Request) {
  const value = request.headers.get("x-correlation-id");
  return value && z.uuid().safeParse(value).success ? value : crypto.randomUUID();
}
/** SQL refusals the admin can act on. Anything else from SQL or the network is an outage (503). */
const sqlRefusals: ReadonlyArray<readonly [RegExp, number, HomeNoticeErrorCode]> = [
  [/home_notices_slug_key/, 409, "SLUG_TAKEN"],
  [/home notice not found/, 404, "NOT_FOUND"],
  [/revision conflict/, 409, "REVISION_CONFLICT"],
  [/complete ko and en localizations/, 409, "INCOMPLETE"],
  [/home notice is immutable|home notice archived|already published|archived home notice cannot be published/, 409, "STATE_CONFLICT"],
];
function failure(error: unknown) {
  if (error instanceof CertificationBodyError) return json({ error: error.code }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "INVALID_REQUEST" }, 400);
  if (error instanceof AuthError) return json({ error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" }, error.status === 401 ? 401 : 403);
  // parseNoticeDocument refuses private images and unsupported nodes before any RPC.
  if (error instanceof Error && /^(Notice|Private Notice|Invalid Notice|Unsupported Notice|Only H2|External videos)/.test(error.message)) return json({ error: "INVALID_BODY", message: error.message }, 400);
  if (error instanceof HomeNoticeRepositoryError) {
    const refusal = sqlRefusals.find(([pattern]) => pattern.test(error.message));
    if (refusal) return json({ error: refusal[2], message: error.message }, refusal[1]);
    if (error.code === "23514" || error.code === "22023") return json({ error: "INVALID_REQUEST" }, 400);
  }
  return json({ error: "UNAVAILABLE", message: "Home notice request failed" }, 503);
}

export function createHomeNoticeAdminHandlers(getDeps: () => HomeNoticeAdminDependencies) {
  return {
    async GET(request: Request) {
      try {
        const deps = getDeps();
        const session = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: correlation(request) });
        return json(await deps.repository.listAdmin(session));
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      try {
        const c = correlation(request);
        const deps = getDeps();
        const session = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: c });
        if (session.role === "viewer") return json({ error: "FORBIDDEN" }, 403);
        const value = await boundedJson(request, 256 * 1024);
        const result = value && typeof value === "object" && "action" in value && value.action === "save"
          ? await deps.repository.save(session, c, saveSchema.parse(value))
          : await deps.repository.state(session, c, stateSchema.parse(value));
        deps.invalidatePublicContent();
        return json(result);
      } catch (error) { return failure(error); }
    },
    async uploadAsset(request: Request, context: { params: Promise<{ id: string }> }) {
      try {
        z.uuid().parse((await context.params).id);
        const c = correlation(request);
        const deps = getDeps();
        const session = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: c });
        if (session.role === "viewer") return json({ error: "FORBIDDEN" }, 403);
        const form = await boundedMultipart(request, MAX_PUBLIC_IMAGE_MULTIPART_BYTES);
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "FILE_REQUIRED" }, 400);
        const asset = await deps.registerImage(session, c, new Uint8Array(await file.arrayBuffer()));
        return json({ url: asset.url });
      } catch (error) {
        if (error instanceof CertificationBodyError) return json({ error: error.code }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
        if (error instanceof AuthError) return json({ error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" }, error.status === 401 ? 401 : 403);
        if (error instanceof z.ZodError) return json({ error: "INVALID_REQUEST" }, 400);
        return json({ error: "HOME_NOTICE_ASSET_ERROR", message: "Upload failed" }, 400);
      }
    },
  };
}

const publicQuerySchema = z.object({ locale: z.enum(["ko", "en"]).default("ko"), cursor: z.string().min(1).max(256).optional() }).strict();

/** GET /api/public/notices?locale=&cursor= — 20 per page, a repeated or unknown key is refused. */
export function createPublicHomeNoticesHandler(getRepository: () => Pick<HomeNoticeRepository, "listPublished">) {
  return async function GET(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    const query = new Set(keys).size === keys.length ? publicQuerySchema.safeParse(Object.fromEntries(params)) : null;
    if (!query?.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    try {
      const page = await getRepository().listPublished(query.data.locale, { limit: 20, cursor: query.data.cursor ?? null });
      return Response.json(page, { headers: publicContentCacheHeaders() });
    } catch (error) {
      if (error instanceof HomeNoticeRepositoryError && /cursor/.test(error.message)) return Response.json({ error: { code: "INVALID_CURSOR" } }, { status: 400 });
      return Response.json({ error: { code: "HOME_NOTICES_UNAVAILABLE" } }, { status: 503 });
    }
  };
}
