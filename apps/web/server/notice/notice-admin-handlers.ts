import "server-only";
import { z } from "zod";
import { boundedJson, boundedMultipart, CertificationBodyError } from "@/server/certification/certification-http";
import { MAX_PUBLIC_IMAGE_MULTIPART_BYTES } from "@/server/media/public-image-processing";
import { noticeSlugSchema } from "./notice-domain";
import { AuthError } from "../../features/auth/domain/auth-errors";
import type { NoticeActor } from "./notice-repository";

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });

const documentSchema = z.record(z.string(), z.unknown());
const saveSchema = z.object({
  action: z.literal("save"),
  id: z.string().uuid().optional(),
  expectedRevision: z.number().int().positive().optional(),
  slug: noticeSlugSchema,
  pinned: z.boolean(),
  postType: z.enum(["notice", "artist_post"]).optional(),
  visibility: z.enum(["public", "members"]).optional(),
  localizations: z.object({
    ko: z.object({ title: z.string().trim().min(1).max(160), body: documentSchema }),
    en: z.object({ title: z.string().trim().min(1).max(160), body: documentSchema }),
  }),
}).refine(value => (value.postType === undefined) === (value.visibility === undefined), "Content type and visibility are required together");
const stateSchema = z.object({
  action: z.enum(["publish", "unpublish", "archive"]),
  id: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(10).optional(),
});

function correlation(request: Request) {
  const value = request.headers.get("x-correlation-id");
  return value && z.string().uuid().safeParse(value).success ? value : crypto.randomUUID();
}
export type NoticeSession = NoticeActor & { kind?: "admin" | "operator" };
export type NoticeHandlerDeps = {
  authorize: (input: { authorization: string; correlationId: string; celebrityId: string }) => Promise<NoticeSession>;
  repository: {
    listAdmin(actor: NoticeActor, celebrityId: string): Promise<unknown>;
    save(actor: NoticeActor, correlationId: string, input: never): Promise<unknown>;
    state(actor: NoticeActor, correlationId: string, input: never): Promise<unknown>;
    upload(actor: NoticeActor, input: { celebrityId: string; noticeId: string; file: File }): Promise<unknown>;
    noticeBelongsToChannel?(noticeId: string, celebrityId: string): Promise<boolean>;
  };
};
function failure(error: unknown) {
  if (error instanceof CertificationBodyError) return json({ error: error.code }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
  if (error instanceof Error && error.message === "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED") return json({ error: "FORBIDDEN" }, 403);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "INVALID_REQUEST" }, 400);
  if (error instanceof Error && /active channel operator required/.test(error.message)) return json({ error: "FORBIDDEN" }, 403);
  if (error instanceof AuthError) {
    return json(
      { error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" },
      error.status === 401 ? 401 : 403,
    );
  }
  return json({ error: "NOTICE_ADMIN_ERROR", message: "Notice request failed" }, 409);
}

export function createNoticeListHandlers(getDeps: () => NoticeHandlerDeps) {
  return {
    async GET(request: Request, context: { params: Promise<{ id: string }> }) {
      try {
        const { id } = await context.params;
        z.string().uuid().parse(id);
        const c = correlation(request);
        const deps = getDeps();
        const session = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: c, celebrityId: id });
        return json(await deps.repository.listAdmin(session, id));
      } catch (error) { return failure(error); }
    },
    async POST(request: Request, context: { params: Promise<{ id: string }> }) {
      try {
        const { id: celebrityId } = await context.params;
        z.string().uuid().parse(celebrityId);
        const c = correlation(request);
        const deps = getDeps();
        const session = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: c, celebrityId });
        if (session.role === "viewer") return json({ error: "FORBIDDEN" }, 403);
        const value = await boundedJson(request, 256 * 1024);
        if (value && typeof value === "object" && "action" in value && value.action === "save") {
          const body = saveSchema.parse(value);
          return json(await deps.repository.save(session, c, { ...body, celebrityId } as never));
        }
        const body = stateSchema.parse(value);
        if (session.kind === "operator" && !(await deps.repository.noticeBelongsToChannel?.(body.id, celebrityId))) {
          return json({ error: "FORBIDDEN" }, 403);
        }
        return json(await deps.repository.state(session, c, body as never));
      } catch (error) { return failure(error); }
    },
  };
}

export function createNoticeAssetHandler(getDeps: () => NoticeHandlerDeps) {
  return async function POST(request: Request, context: { params: Promise<{ id: string; noticeId: string }> }) {
    try {
      const { id, noticeId } = await context.params;
      z.string().uuid().parse(id);
      z.string().uuid().parse(noticeId);
      const correlationId = correlation(request);
      const deps = getDeps();
      const session = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId, celebrityId: id });
      if (session.role === "viewer") return json({ error: "FORBIDDEN" }, 403);
      const form = await boundedMultipart(request, MAX_PUBLIC_IMAGE_MULTIPART_BYTES);
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "FILE_REQUIRED" }, 400);
      return json(await deps.repository.upload(session, { celebrityId: id, noticeId, file }));
    } catch (error) {
      if (error instanceof CertificationBodyError) return json({ error: error.code }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
      if (error instanceof AuthError) return json({ error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" }, error.status === 401 ? 401 : 403);
      return json({ error: "NOTICE_ASSET_ERROR", message: "Upload failed" }, 400);
    }
  };
}
