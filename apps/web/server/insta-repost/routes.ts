import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { creatorSlugSchema } from "@/features/passport/domain/dukjil-types";
import {
  checkInstaRepostUrl, instaRepostListSchema, instaRepostQueueSchema, instaRepostQueueStatusSchema, instaRepostReviewBodySchema, instaRepostReviewResultSchema,
  instaRepostSubmitResultSchema, instaRepostSubmitSchema,
} from "@/features/insta-repost/domain/insta-repost";
import type { AdminSession } from "@/server/admin/admin-session-gate";
import { boundedJson, correlation } from "@/server/certification/certification-http";
import { resolveCreatorId } from "@/server/dukjil/creator-id";

/** B3 §5.2. A member submits an Instagram repost (pending); an admin or an owner/manager of the creator's fan page approves (30P under
 * the repost rule's caps, counted by approvals) or rejects it with a reason. Payment, caps and the self-review refusal live in
 * review_fan_insta_repost; this layer checks the address, maps codes and streams the story capture to the people allowed to see it. */
export interface InstaRepostDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  authorizeAdmin(authorization: string, correlationId: string): Promise<AdminSession>;
  /** The private bucket object, streamed; the path never leaves the server. */
  stream(path: string): Promise<Response>;
  resolveCreatorId?(slug: string): Promise<string | null>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const STATUS: Record<string, number> = {
  SHARE_PROOF_URL_SHORT: 422, SHARE_PROOF_URL_UNSUPPORTED: 422, SHARE_PROOF_URL_NOT_POST: 422, SHARE_PROOF_OWN_POST_REQUIRED: 400,
  INSTA_REPOST_CAPTURE_REQUIRED: 400, INSTA_REPOST_CAPTURE_INVALID: 400, INSTA_REPOST_INVALID: 400, SHARE_PROOF_URL_REUSED: 409,
  PASSPORT_REQUIRED: 403, CREATOR_NOT_FOUND: 404, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, POLICY_INACTIVE: 409,
  SELF_REVIEW_FORBIDDEN: 403, REVIEW_FORBIDDEN: 403, REVIEW_STALE: 409, REVIEW_INVALID: 400, SHARE_PROOF_NOT_FOUND: 404, MEDIA_NOT_FOUND: 404,
};
function failure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN" } }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    const own = error instanceof z.ZodError && error.issues.some(issue => issue.path[0] === "ownPost");
    return Response.json({ error: { code: own ? "SHARE_PROOF_OWN_POST_REQUIRED" : "INVALID_REQUEST" } }, { status: 400, headers });
  }
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find(known => message.includes(known));
  return code ? Response.json({ error: { code } }, { status: STATUS[code], headers }) : Response.json({ error: { code: "INSTA_REPOST_UNAVAILABLE" } }, { status: 503, headers });
}
const URL_CODE = { short: "SHARE_PROOF_URL_SHORT", unsupported: "SHARE_PROOF_URL_UNSUPPORTED", not_post: "SHARE_PROOF_URL_NOT_POST" } as const;
const accessSchema = z.object({ storagePath: z.string().min(1), contentType: z.string().min(1) }).strict().nullable();
const checked = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("INSTA_REPOST_UNAVAILABLE");
  return parsed.data;
};
function one(request: Request, key: string) {
  const values = new URL(request.url).searchParams.getAll(key);
  if (values.length > 1) throw new SyntaxError("duplicate query");
  return values[0] ?? null;
}
function queueQuery(request: Request) {
  const status = instaRepostQueueStatusSchema.parse(one(request, "status") ?? "pending");
  const before = one(request, "after");
  if (before !== null && Number.isNaN(Date.parse(before))) throw new SyntaxError("after");
  return { p_status: status, p_before: before ? new Date(before).toISOString() : null, p_limit: 50 };
}

export function createInstaRepostHandlers(deps: InstaRepostDependencies) {
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return failure(error); } };
  const creator = async (slug: string) => {
    const id = await (deps.resolveCreatorId ?? resolveCreatorId)(creatorSlugSchema.parse(slug));
    if (!id) throw new Error("CREATOR_NOT_FOUND");
    return id;
  };
  const admin = async (request: Request) => {
    const authorization = request.headers.get("authorization");
    if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "A bearer token is required");
    return deps.authorizeAdmin(authorization, correlation(request));
  };
  const capture = async (access: unknown) => {
    const found = accessSchema.parse(access);
    if (!found) throw new Error("MEDIA_NOT_FOUND");
    const upstream = await deps.stream(found.storagePath);
    if (!upstream.ok) throw new Error("INSTA_REPOST_UNAVAILABLE");
    return new Response(upstream.body, { status: 200, headers: { ...headers, "content-type": found.contentType } });
  };
  const decide = async (actor: string, allowlist: string | null, id: string, request: Request) => {
    z.uuid().parse(id);
    const body = instaRepostReviewBodySchema.parse(await boundedJson(request, 1024));
    const raw = await deps.rpc("review_fan_insta_repost", { p_actor: actor, p_allowlist: allowlist, p_id: id, p_expected_revision: body.revision,
      p_decision: body.decision, p_reject_code: body.decision === "reject" ? body.rejectCode : null });
    return Response.json({ result: checked(instaRepostReviewResultSchema, raw) }, { headers });
  };
  return {
    // POST /api/me/insta-reposts
    submit: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const body = instaRepostSubmitSchema.parse(await boundedJson(request, 2048));
      let url: string | null = null, key: string | null = null;
      if (body.url) {
        const parsed = checkInstaRepostUrl(body.url, body.postKind);
        if (!parsed.ok) throw new Error(URL_CODE[parsed.problem]);
        url = parsed.value.url; key = parsed.value.key;
      }
      const celebrity = await creator(body.creator);
      const raw = await deps.rpc("submit_fan_insta_repost", { p_user: appUserId, p_celebrity: celebrity, p_post_kind: body.postKind, p_url: url, p_url_key: key,
        p_asset_id: body.captureId ?? null, p_own_post: body.ownPost });
      const stored = checked(instaRepostSubmitResultSchema, raw);
      return Response.json(stored, { status: stored.replayed ? 200 : 201, headers });
    }),
    // GET /api/me/insta-reposts?creator=slug
    list: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const celebrity = await creator(one(request, "creator") ?? "");
      return Response.json(checked(instaRepostListSchema, await deps.rpc("list_fan_insta_reposts", { p_user: appUserId, p_celebrity: celebrity })), { headers });
    }),
    // GET /api/me/insta-reposts/{id}/capture
    ownCapture: (request: Request, id: string) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      return capture(await deps.rpc("authorize_share_proof_image_read", { p_actor: appUserId, p_allowlist: null, p_proof_id: z.uuid().parse(id), p_variant: "original" }));
    }),
    // GET /api/admin/insta-reposts?status=&creator=&after=
    adminQueue: (request: Request) => run(async () => {
      const query = queueQuery(request);
      const slug = one(request, "creator");
      const actor = await admin(request);
      const celebrity = slug ? await creator(slug) : null;
      const raw = await deps.rpc("read_insta_repost_review_queue", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_celebrity: celebrity, ...query });
      const parsed = checked(instaRepostQueueSchema, raw);
      return Response.json({ ...parsed, hasMore: parsed.items.length === 50 }, { headers });
    }),
    // POST /api/admin/insta-reposts/{id}/review
    adminReview: (request: Request, id: string) => run(async () => {
      const actor = await admin(request);
      return decide(actor.appUserId, actor.allowlistId, id, request);
    }),
    // GET /api/admin/insta-reposts/{id}/capture
    adminCapture: (request: Request, id: string) => run(async () => {
      const actor = await admin(request);
      return capture(await deps.rpc("authorize_share_proof_image_read", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_proof_id: z.uuid().parse(id), p_variant: "original" }));
    }),
    // GET /api/groups/{pageId}/insta-reposts?status=&after=  (owner or manager of that fan page)
    pageQueue: (request: Request, pageId: string) => run(async () => {
      const query = queueQuery(request);
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const raw = await deps.rpc("read_page_insta_repost_queue", { p_actor: appUserId, p_page: z.uuid().parse(pageId), ...query });
      const parsed = checked(instaRepostQueueSchema, raw);
      return Response.json({ ...parsed, hasMore: parsed.items.length === 50 }, { headers });
    }),
    // POST /api/groups/{pageId}/insta-reposts/{id}/review — the database decides from the repost's creator who may review it
    pageReview: (request: Request, id: string) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      return decide(appUserId, null, id, request);
    }),
    // GET /api/groups/{pageId}/insta-reposts/{id}/capture
    pageCapture: (request: Request, id: string) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      return capture(await deps.rpc("authorize_share_proof_image_read", { p_actor: appUserId, p_allowlist: null, p_proof_id: z.uuid().parse(id), p_variant: "original" }));
    }),
  };
}
