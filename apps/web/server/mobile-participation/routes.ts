import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedJson } from "@/server/certification/certification-http";
import {
  activityHeartbeatSchema, activityStartSchema, participationAnswerWriteSchema, participationCommentWriteSchema, participationContextTypeSchema,
  participationLocaleSchema, participationPostDeleteSchema, participationPostWriteSchema, participationReactionSchema,
  qrRequestKeySchema, qrResolveSchema, voteSubmitSchema,
} from "./domain";

export interface MobileParticipationDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  applicationOrigin?: string;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" } as const;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const uuid = z.uuid();

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const message = error instanceof Error ? error.message : "";
  const mappings = [
    ["CONTENT_REJECTED", "CONTENT_REJECTED", 400],
    ["MOBILE_PARTICIPATION_APPLICATION_RATE_LIMITED", "APPLICATION_RATE_LIMITED", 429],
    ["MOBILE_PARTICIPATION_QR_RATE_LIMITED", "QR_RATE_LIMITED", 429],
    ["MOBILE_PARTICIPATION_ACTIVITY_NOT_CONFIGURED", "ACTIVITY_NOT_CONFIGURED", 409],
    ["MOBILE_PARTICIPATION_VOTE_NOT_CONFIGURED", "VOTE_NOT_CONFIGURED", 409],
    ["MOBILE_PARTICIPATION_POLICY_CHANGED", "POLICY_CHANGED", 409],
    ["MOBILE_PARTICIPATION_VOTE_NOT_OPEN", "VOTE_NOT_OPEN", 409],
    ["MOBILE_PARTICIPATION_VOTE_CLOSED", "VOTE_CLOSED", 409],
    ["MOBILE_PARTICIPATION_VOTE_DUPLICATE", "VOTE_DUPLICATE", 409],
    ["MOBILE_PARTICIPATION_CONFLICT", "REQUEST_CONFLICT", 409],
    ["MOBILE_PARTICIPATION_VISIT_REQUIRED", "VISIT_REQUIRED", 409],
    ["MOBILE_PARTICIPATION_CARD_CLOSED", "CARD_CLOSED", 409],
    ["MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE", "BENEFIT_UNAVAILABLE", 409],
    ["MOBILE_PARTICIPATION_TARGET_UNAVAILABLE", "SPACE_UNAVAILABLE", 409],
    ["MOBILE_PARTICIPATION_FORBIDDEN", "FORBIDDEN", 403],
    ["MOBILE_PARTICIPATION_NOT_FOUND", "NOT_FOUND", 404],
    ["MEDIA_INVALID_ASSET", "MEDIA_INVALID_ASSET", 409],
  ] as const;
  const match = mappings.find(([marker]) => message.includes(marker));
  const response = json({ error: { code: match?.[1] ?? "PARTICIPATION_UNAVAILABLE" } }, match?.[2] ?? 503);
  if (match?.[1] === "QR_RATE_LIMITED") response.headers.set("retry-after", "60");
  return response;
}
function one(url: URL, name: string) { const values = url.searchParams.getAll(name); if (values.length > 1) throw new SyntaxError("duplicate query"); return values[0] ?? null; }
function page(request: Request) {
  const url = new URL(request.url); let cursor: { at: string; id: string } | null = null; const encoded = one(url, "cursor");
  if (encoded) { try { cursor = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict().parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))); } catch { throw new SyntaxError("invalid cursor"); } }
  return { p_after: cursor?.at ?? null, p_after_id: cursor?.id ?? null, p_limit: z.coerce.number().int().min(1).max(50).parse(one(url, "limit") ?? 20) };
}
function withCursor(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const value = raw as { items?: unknown[]; hasMore?: boolean }; const last = value.items?.at(-1) as { updatedAt?: string; startsAt?: string; id?: string } | undefined;
  return { ...value, nextCursor: value.hasMore && last?.id && (last.updatedAt || last.startsAt) ? Buffer.from(JSON.stringify({ at: last.updatedAt ?? last.startsAt, id: last.id })).toString("base64url") : null };
}

export function createMobileParticipationHandlers(deps: MobileParticipationDependencies) {
  const owner = async (request: Request) => (await deps.authorize(request.headers.get("authorization"))).appUserId;
  const run = async (fn: () => Promise<Response>) => { try { return await fn(); } catch (error) { return errorResponse(error); } };
  return {
    eventApplicationLink: (request: Request, id: string) => run(async () => {
      const appUserId = await owner(request);
      z.object({}).strict().parse(await boundedJson(request, 256));
      const code = randomBytes(32).toString("base64url");
      const result = z.object({ applicationUrl: z.url(), linkSupported: z.boolean(), expiresAt: z.iso.datetime({ offset: true }).optional() }).parse(
        await deps.rpc("create_owned_mobile_event_application_link", {
          p_app_user_id: appUserId, p_event_id: uuid.parse(id),
          p_code_hash: createHash("sha256").update(code).digest("hex"),
        }),
      );
      const destination = new URL(result.applicationUrl);
      const supported = result.linkSupported && deps.applicationOrigin != null
        && destination.origin === new URL(deps.applicationOrigin).origin
        && ["/connect/kyaa-wave", "/connect/byus-day"].includes(destination.pathname) && destination.protocol === "https:"
        && !destination.username && !destination.password;
      if (supported) {
        const fragment = new URLSearchParams({ "app_code": code });
        if (destination.hash) fragment.set("app_anchor", destination.hash.slice(1));
        destination.hash = fragment.toString();
      }
      return json({ applicationUrl: destination.toString(), linkSupported: supported });
    }),
    catalog: (request: Request) => run(async () => {
      const url = new URL(request.url);
      const appUserId = await owner(request);
      const kind = z.enum(["live", "event", "goods", "space"]);
      const encoded = one(url, "cursor");
      let cursor: { at: string; id: string; kind: z.infer<typeof kind> } | null = null;
      if (encoded) {
        try {
          cursor = z.object({ at: z.iso.datetime({ offset: true }), id: uuid, kind }).strict().parse(
            JSON.parse(Buffer.from(z.string().max(512).parse(encoded), "base64url").toString("utf8")),
          );
        } catch { throw new SyntaxError("invalid cursor"); }
      }
      const raw = await deps.rpc("read_owned_mobile_participation_catalog", {
        p_app_user_id: appUserId,
        p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko"),
        p_phase: z.enum(["ongoing", "upcoming", "past"]).parse(one(url, "phase") ?? "ongoing"),
        p_kind: z.enum(["all", "live", "event", "goods", "space"]).parse(one(url, "kind") ?? "all"),
        p_celebrity_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).nullable().parse(one(url, "favorite")),
        p_after: cursor?.at ?? null, p_after_id: cursor?.id ?? null, p_after_kind: cursor?.kind ?? null,
        p_limit: z.coerce.number().int().min(1).max(50).parse(one(url, "limit") ?? 20),
      });
      const result = raw as { nextCursor: unknown };
      return json({ ...result, nextCursor: result.nextCursor == null ? null : Buffer.from(JSON.stringify(result.nextCursor)).toString("base64url") });
    }),
    events: (request: Request) => run(async () => { const url = new URL(request.url); return json(withCursor(await deps.rpc("read_owned_mobile_participation_events_v2", { p_app_user_id: await owner(request), p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko"), ...page(request) }))); }),
    event: (request: Request, id: string) => run(async () => { const url = new URL(request.url), result = await deps.rpc("read_owned_mobile_participation_event_v2", { p_app_user_id: await owner(request), p_event_id: uuid.parse(id), p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko") }); return result === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(result); }),
    context: (request: Request, type: string, id: string) => run(async () => { const url = new URL(request.url); const result = await deps.rpc("read_owned_mobile_participation_context_v2", { p_app_user_id: await owner(request), p_context_type: participationContextTypeSchema.parse(type), p_context_id: uuid.parse(id), p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko"), ...page(request) }); return result === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(withCursor(result)); }),
    space: (request: Request, id: string) => run(async () => { const url = new URL(request.url), result = await deps.rpc("read_owned_mobile_participation_space", { p_app_user_id: await owner(request), p_space_id: uuid.parse(id), p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko") }); return result === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(result); }),
    benefit: (request: Request, id: string) => run(async () => { const url = new URL(request.url), result = await deps.rpc("read_owned_mobile_participation_benefit", { p_app_user_id: await owner(request), p_benefit_id: uuid.parse(id), p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko") }); return result === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(result); }),
    commemorativeCard: (request: Request, id: string) => run(async () => {
      const appUserId = await owner(request), cardId = uuid.parse(id), url = new URL(request.url);
      const locale = participationLocaleSchema.parse(one(url, "locale") ?? "ko");
      if (request.method === "GET") {
        const result = await deps.rpc("read_owned_mobile_commemorative_card", { p_app_user_id: appUserId, p_card_id: cardId, p_locale: locale });
        return result === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(result);
      }
      const value = z.object({ memberKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), requestKey: uuid, expectedPolicyVersion: z.string().trim().min(1).max(80) }).strict().parse(await boundedJson(request, 2048));
      return json(await deps.rpc("claim_owned_mobile_commemorative_card", { p_app_user_id: appUserId, p_card_id: cardId, p_member_key: value.memberKey, p_request_key: value.requestKey, p_expected_policy_version: value.expectedPolicyVersion, p_locale: locale }), 201);
    }),
    commemorativeCardShare: (request: Request, id: string) => run(async () => {
      const url = new URL(request.url);
      return json(await deps.rpc("read_owned_mobile_commemorative_card_share", { p_app_user_id: await owner(request), p_card_id: uuid.parse(id), p_locale: participationLocaleSchema.parse(one(url, "locale") ?? "ko") }));
    }),
    benefitQr: (request: Request, spaceId: string) => run(async () => { const appUserId = await owner(request), id = uuid.parse(spaceId); if (request.method === "GET") return json(await deps.rpc("read_owned_mobile_participation_benefit_qr", { p_app_user_id: appUserId, p_space_id: id })); const value = z.object({ requestKey: qrRequestKeySchema }).strict().parse(await boundedJson(request, 1024)); return json(await deps.rpc("issue_owned_mobile_participation_benefit_qr", { p_app_user_id: appUserId, p_space_id: id, p_request_key: value.requestKey }), 201); }),
    liveContext: (request: Request, liveSlug: string) => run(async () => { const result = await deps.rpc("read_owned_mobile_participation_live_context", { p_app_user_id: await owner(request), p_live_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).parse(liveSlug) }); return result === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(result); }),
    savePost: (request: Request, pathPostId?: string) => run(async () => { const value = participationPostWriteSchema.parse(await boundedJson(request, 32_768)); const postId = pathPostId ? uuid.parse(pathPostId) : value.postId; return json(await deps.rpc("save_owned_mobile_participation_post_v2", { p_app_user_id: await owner(request), p_context_type: value.contextType, p_context_id: value.contextId, p_post_id: postId, p_kind: value.kind, p_body: value.body, p_asset_ids: value.assetIds, p_expected_revision: value.expectedRevision, p_request_key: value.requestKey }), postId ? 200 : 201); }),
    answerQuestion: (request: Request, questionId: string) => run(async () => { const value = participationAnswerWriteSchema.parse(await boundedJson(request, 8192)); return json(await deps.rpc("answer_owned_mobile_participation_question", { p_app_user_id: await owner(request), p_question_id: uuid.parse(questionId), p_body: value.body, p_request_key: value.requestKey }), 201); }),
    postRequest: (request: Request, requestKey: string) => run(async () => { const result = await deps.rpc("read_owned_mobile_participation_post_request", { p_app_user_id: await owner(request), p_request_key: uuid.parse(requestKey) }); return result === null ? json({ error: { code: "POST_REQUEST_NOT_FOUND" } }, 404) : json(result); }),
    removePost: (request: Request, id: string) => run(async () => { const value = participationPostDeleteSchema.parse(await boundedJson(request, 1024)); return json(await deps.rpc("remove_owned_mobile_participation_post_v2", { p_app_user_id: await owner(request), p_post_id: uuid.parse(id), p_expected_revision: value.expectedRevision, p_request_key: value.requestKey })); }),
    comment: (request: Request, postId: string) => run(async () => { const value = participationCommentWriteSchema.parse(await boundedJson(request, 8192)); return json(await deps.rpc("post_owned_mobile_participation_comment", { p_app_user_id: await owner(request), p_post_id: uuid.parse(postId), p_body: value.body, p_request_key: value.requestKey }), 201); }),
    reaction: (request: Request, targetType: string, targetId: string) => run(async () => { const value = participationReactionSchema.parse(await boundedJson(request, 1024)); return json(await deps.rpc("set_owned_mobile_participation_reaction", { p_app_user_id: await owner(request), p_target_type: z.enum(["post", "comment"]).parse(targetType), p_target_id: uuid.parse(targetId), p_emoji: value.emoji })); }),
    startActivity: (request: Request, activityId: string) => run(async () => { const value = activityStartSchema.parse(await boundedJson(request, 1024)); return json(await deps.rpc("start_owned_mobile_participation_activity", { p_app_user_id: await owner(request), p_activity_id: uuid.parse(activityId), p_request_key: value.requestKey }), 201); }),
    heartbeat: (request: Request, sessionId: string) => run(async () => { const value = activityHeartbeatSchema.parse(await boundedJson(request, 1024)); return json(await deps.rpc("heartbeat_owned_mobile_participation_activity", { p_app_user_id: await owner(request), p_session_id: uuid.parse(sessionId), p_expected_version: value.expectedVersion, p_foreground: value.foreground, p_playing: value.playing, p_position_ms: value.positionMs, p_client_monotonic_ms: value.clientMonotonicMs })); }),
    vote: (request: Request, voteId: string) => run(async () => { const appUserId = await owner(request), id = uuid.parse(voteId); if (request.method === "GET") { const result = await deps.rpc("read_owned_mobile_participation_vote", { p_app_user_id: appUserId, p_vote_id: id }); return result === null ? json({ error: { code: "VOTE_NOT_CONFIGURED" } }, 409) : json(result); } const value = voteSubmitSchema.parse(await boundedJson(request, 4096)); return json(await deps.rpc("submit_owned_mobile_participation_vote", { p_app_user_id: appUserId, p_vote_id: id, p_option_ids: value.optionIds, p_request_key: value.requestKey, p_expected_policy_version: value.expectedPolicyVersion })); }),
    resolveQr: (request: Request) => run(async () => { const value = qrResolveSchema.parse(await boundedJson(request, 2048)); return json(await deps.rpc("resolve_owned_mobile_participation_qr", { p_app_user_id: await owner(request), p_raw_code: value.rawCode, p_request_key: value.requestKey })); }),
    qrStatus: (request: Request, requestKey: string) => run(async () => { const result = await deps.rpc("read_owned_mobile_participation_qr_request", { p_app_user_id: await owner(request), p_request_key: qrRequestKeySchema.parse(requestKey) }); return result === null ? json({ error: { code: "QR_REQUEST_NOT_FOUND" } }, 404) : json(result); }),
  };
}
