import "server-only";

import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { celebritySlugSchema } from "@/features/fanpage/domain/community";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";
import { mobileAccountLevelSchema, mobileActivityCursorSchema, mobileActivitySchema } from "@/server/mobile-profile/domain";
import { ownedFanProfilePublicInputSchema, ownedFanProfilePublicSchema, socialProfileCardSchema } from "@/features/fan-profile/domain";

export interface SocialDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const uuid = z.uuid();
const requestId = z.uuid();
const locale = z.enum(["ko", "en"]);
const action = z.enum(["accept", "reject", "cancel", "unfriend"]);
const dmAction = z.enum(["accept", "reject", "cancel"]);
const reaction = z.enum(["heart", "like", "laugh", "surprise", "sad"]);
const privacyInput = z.object({ profileVisible: z.boolean().optional(), favoriteSlugs: z.array(celebritySlugSchema).max(100), dmPolicy: z.enum(["friends", "requests", "none"]) }).strict();
const friendInput = z.object({ profileId: uuid, celebritySlug: celebritySlugSchema.optional(), requestId }).strict();
const resolveInput = z.object({ action, requestId }).strict();
const dmRequestInput = z.object({ profileId: uuid, text: z.string().trim().min(1).max(1000), assetId: uuid.optional(), requestId }).strict();
const dmResolveInput = z.object({ action: dmAction, requestId }).strict();
const messageInput = z.object({ text: z.string().trim().max(2000).default(""), assetId: uuid.optional(), requestId }).strict().refine(value => value.text.length > 0 || value.assetId !== undefined, "Message required");
const reactionInput = z.object({ reaction: reaction.nullable(), requestId }).strict();
const reportInput = z.object({ reason: z.enum(["spam", "harassment", "sexual", "hate", "other"]), details: z.string().trim().max(500).optional(), requestId }).strict();
const blockInput = z.object({ profileId: uuid, requestId }).strict();
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: uuid }).strict();

const favoriteSchema = z.object({ slug: celebritySlugSchema, name: z.string().min(1).max(120), imageUrl: z.string().min(1).max(2000), fanXp: z.number().int(), fanTier: z.string().min(1).max(40), verified: z.boolean() }).strict();
export const socialProfileSchema = z.object({
  profile: z.object({ id: uuid, nickname: z.string().min(1).max(80), avatarUrl: publicAvatarUrlSchema, accountLevel: mobileAccountLevelSchema }).strict(),
  favorite: favoriteSchema.nullable(),
  publicActivityCount: z.number().int().nonnegative(),
  activities: z.array(mobileActivitySchema).max(30),
  activityNextCursor: mobileActivityCursorSchema.nullable(),
  commonFavorites: z.array(z.object({ slug: celebritySlugSchema, name: z.string().min(1).max(120), imageUrl: z.string().min(1).max(2000), myFanTier: z.string().min(1).max(40), theirFanTier: z.string().min(1).max(40) }).strict()).max(100),
  relationship: z.object({ friendshipId: uuid.nullable(), status: z.enum(["none", "incoming", "outgoing", "friends"]), celebritySlug: celebritySlugSchema.nullable() }).strict(),
  dm: z.object({ conversationId: uuid.nullable(), status: z.enum(["none", "incoming_request", "outgoing_request", "accepted", "rejected"]), canSend: z.boolean() }).strict(),
  capabilities: z.object({ canRequestFriend: z.boolean(), canRequestDm: z.boolean(), canBlock: z.boolean() }).strict(),
  isSelf: z.boolean(),
}).strict();

function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const code = error instanceof Error ? error.message : "";
  const status = ({ CONTENT_REJECTED: 400, PROFILE_INVALID_REQUEST: 400, SOCIAL_NOT_FOUND: 404, SOCIAL_FORBIDDEN: 403, SOCIAL_BLOCKED: 403, SOCIAL_CONFLICT: 409, SOCIAL_IDEMPOTENCY_CONFLICT: 409, SOCIAL_RATE_LIMITED: 429, SOCIAL_BODY_TOO_LARGE: 413, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403 } as Record<string, number>)[code];
  return json({ error: { code: status ? code : "SOCIAL_UNAVAILABLE" } }, status ?? 503);
}

async function body(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new SyntaxError("missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 8192) { await reader.cancel(); throw new Error("SOCIAL_BODY_TOO_LARGE"); } chunks.push(chunk.value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
function one(url: URL, name: string) { const values = url.searchParams.getAll(name); if (values.length > 1) throw new SyntaxError("duplicate query"); return values[0] ?? null; }
function decodeCursor(raw: string | null) { if (!raw) return null; try { return cursorSchema.parse(JSON.parse(Buffer.from(z.string().max(240).parse(raw), "base64url").toString("utf8"))); } catch { throw new SyntaxError("invalid cursor"); } }
function decodeActivityCursor(raw: string | null) { if (!raw) return null; try { return mobileActivityCursorSchema.parse(JSON.parse(Buffer.from(z.string().max(500).parse(raw), "base64url").toString("utf8"))); } catch { throw new SyntaxError("invalid activity cursor"); } }
/** Why the message button is or is not available. `blocked` also covers sanctioned and disabled accounts, so the answer cannot tell them apart. */
export const socialDmStateSchema = z.enum(["self", "blocked", "pending", "incoming", "open", "recipient_off", "friends_only", "not_eligible", "retry_later", "limit", "available"]);
export type SocialDmState = z.infer<typeof socialDmStateSchema>;
const socialReachSchema = z.object({ dmState: socialDmStateSchema, artist: z.boolean() }).strict();
/** The profile itself must not fail over this: without it the page falls back to the profile's capabilities, which also lets the web and the migration ship in either order. */
async function reach(deps: SocialDependencies, appUserId: string, profileId: string) {
  try { return socialReachSchema.parse(await deps.rpc("read_social_profile_reach", { p_app_user_id: appUserId, p_profile_id: profileId })); } catch { return null; }
}
/** Favorite, SNS, intro and the public numbers. Like the message state, a failure leaves the card out instead of failing the profile. */
async function card(deps: SocialDependencies, appUserId: string, profileId: string, pageId: string | null, profileLocale: "ko" | "en") {
  try { return socialProfileCardSchema.parse(await deps.rpc("read_social_profile_card", { p_actor: appUserId, p_profile_id: profileId, p_page_id: pageId, p_locale: profileLocale })); } catch { return null; }
}
/** A reply that breaks the contract is the server's fault, not the request's. */
function ownedFields(value: unknown) { const parsed = ownedFanProfilePublicSchema.safeParse(value); if (!parsed.success) throw new Error("SOCIAL_UNAVAILABLE"); return parsed.data; }
function publicProfile(value: unknown) { const parsed = socialProfileSchema.parse(value); return { ...parsed, activityNextCursor: parsed.activityNextCursor ? Buffer.from(JSON.stringify(parsed.activityNextCursor)).toString("base64url") : null }; }
async function owner(request: Request, deps: SocialDependencies) { return (await deps.authorize(request.headers.get("authorization"))).appUserId; }

export function createSocialHandlers(deps: SocialDependencies) {
  return {
    async profile(request: Request, profileId: string) { try {
      const appUserId = await owner(request, deps); const url = new URL(request.url);
      const activityCursor = decodeActivityCursor(one(url, "activityCursor"));
      const selectedSlug = one(url, "celebritySlug");
      const result = await deps.rpc("read_social_fan_profile", { p_app_user_id: appUserId, p_profile_id: uuid.parse(profileId), p_celebrity_slug: selectedSlug === null ? null : celebritySlugSchema.parse(selectedSlug), p_locale: locale.parse(one(url, "locale") ?? "ko"), p_before: activityCursor?.at ?? null, p_before_id: activityCursor?.id ?? null, p_before_kind: activityCursor?.kind ?? null, p_limit: z.coerce.number().int().min(1).max(30).parse(one(url, "activityLimit") ?? 12) });
      if (result === null) return json({ error: { code: "SOCIAL_NOT_FOUND" } }, 404);
      const pageId = one(url, "pageId"), id = uuid.parse(profileId);
      const [reachValue, cardValue] = await Promise.all([reach(deps, appUserId, id), card(deps, appUserId, id, pageId === null ? null : uuid.parse(pageId), locale.parse(one(url, "locale") ?? "ko"))]);
      return json({ ...publicProfile(result), reach: reachValue, card: cardValue });
    } catch (error) { return failure(error); } },
    async readPublicFields(request: Request) { try { const url = new URL(request.url); return json(ownedFields(await deps.rpc("read_owned_fan_profile_public", { p_app_user_id: await owner(request, deps), p_locale: locale.parse(one(url, "locale") ?? "ko") }))); } catch (error) { return failure(error); } },
    async setPublicFields(request: Request) { try { const appUserId = await owner(request, deps); const url = new URL(request.url); const input = ownedFanProfilePublicInputSchema.parse(await body(request)); return json(ownedFields(await deps.rpc("set_owned_fan_profile_public", { p_app_user_id: appUserId, p_favorite_slug: input.favoriteSlug, p_sns_url: input.snsUrl, p_bio: input.bio, p_locale: locale.parse(one(url, "locale") ?? "ko") }))); } catch (error) { return failure(error); } },
    async profileLink(request: Request) { try { return json(await deps.rpc("read_owned_social_profile_link", { p_app_user_id: await owner(request, deps) })); } catch (error) { return failure(error); } },
    async linkedProfile(request: Request, token: string) { try { const appUserId = await owner(request, deps); const url = new URL(request.url); const activityCursor = decodeActivityCursor(one(url, "activityCursor")); const selectedSlug = one(url, "celebritySlug"); const result = await deps.rpc("resolve_social_profile_link", { p_app_user_id: appUserId, p_token: uuid.parse(token), p_celebrity_slug: selectedSlug === null ? null : celebritySlugSchema.parse(selectedSlug), p_locale: locale.parse(one(url, "locale") ?? "ko"), p_before: activityCursor?.at ?? null, p_before_id: activityCursor?.id ?? null, p_before_kind: activityCursor?.kind ?? null, p_limit: z.coerce.number().int().min(1).max(30).parse(one(url, "activityLimit") ?? 12) }); if (result === null) return json({ error: { code: "SOCIAL_NOT_FOUND" } }, 404); return json(publicProfile(result)); } catch (error) { return failure(error); } },
    async readSettings(request: Request) { try { return json(await deps.rpc("read_owned_social_settings", { p_app_user_id: await owner(request, deps) })); } catch (error) { return failure(error); } },
    async requestStatus(request: Request, id: string) { try { return json(await deps.rpc("read_owned_social_request_status", { p_app_user_id: await owner(request, deps), p_request_id: requestId.parse(id) })); } catch (error) { return failure(error); } },
    async setSettings(request: Request) { try { const appUserId = await owner(request, deps); const input = privacyInput.parse(await body(request)); return json(await deps.rpc("set_owned_social_settings", { p_app_user_id: appUserId, p_profile_visible: true, p_favorite_slugs: input.favoriteSlugs, p_dm_policy: input.dmPolicy })); } catch (error) { return failure(error); } },
    async listFriends(request: Request) { try { const url = new URL(request.url); return json(await deps.rpc("read_owned_social_friends", { p_app_user_id: await owner(request, deps), p_locale: locale.parse(one(url, "locale") ?? "ko") })); } catch (error) { return failure(error); } },
    async requestFriend(request: Request) { try { const input = friendInput.parse(await body(request)); return json(await deps.rpc("request_social_friend", { p_app_user_id: await owner(request, deps), p_profile_id: input.profileId, p_celebrity_slug: input.celebritySlug ?? null, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async resolveFriend(request: Request, id: string) { try { const input = resolveInput.parse(await body(request)); return json(await deps.rpc("resolve_social_friend", { p_app_user_id: await owner(request, deps), p_friendship_id: uuid.parse(id), p_action: input.action, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async listBlocks(request: Request) { try { return json(await deps.rpc("read_owned_social_blocks", { p_app_user_id: await owner(request, deps) })); } catch (error) { return failure(error); } },
    async block(request: Request) { try { const input = blockInput.parse(await body(request)); return json(await deps.rpc("block_social_profile", { p_app_user_id: await owner(request, deps), p_profile_id: input.profileId, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async unblock(request: Request, profileId: string) { try { return json(await deps.rpc("unblock_social_profile", { p_app_user_id: await owner(request, deps), p_profile_id: uuid.parse(profileId) })); } catch (error) { return failure(error); } },
    async listConversations(request: Request) { try { return json(await deps.rpc("read_owned_dm_conversations", { p_app_user_id: await owner(request, deps) })); } catch (error) { return failure(error); } },
    async requestDm(request: Request) { try { const input = dmRequestInput.parse(await body(request)); if (input.assetId) throw new SyntaxError("First DM attachments require accepted conversation"); return json(await deps.rpc("request_social_dm", { p_app_user_id: await owner(request, deps), p_profile_id: input.profileId, p_body: input.text, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async resolveDm(request: Request, id: string) { try { const input = dmResolveInput.parse(await body(request)); return json(await deps.rpc("resolve_social_dm", { p_app_user_id: await owner(request, deps), p_conversation_id: uuid.parse(id), p_action: input.action, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async messages(request: Request, id: string) { try { const url = new URL(request.url); const cursor = decodeCursor(one(url, "cursor")); return json(await deps.rpc("read_social_dm_messages", { p_app_user_id: await owner(request, deps), p_conversation_id: uuid.parse(id), p_after: cursor?.at ?? null, p_after_id: cursor?.id ?? null, p_limit: z.coerce.number().int().min(1).max(100).parse(one(url, "limit") ?? 50) })); } catch (error) { return failure(error); } },
    async sendMessage(request: Request, id: string) { try { const input = messageInput.parse(await body(request)); return json(await deps.rpc("send_social_dm_message", { p_app_user_id: await owner(request, deps), p_conversation_id: uuid.parse(id), p_body: input.text, p_asset_id: input.assetId ?? null, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async react(request: Request, id: string) { try { const input = reactionInput.parse(await body(request)); return json(await deps.rpc("react_social_dm_message", { p_app_user_id: await owner(request, deps), p_message_id: uuid.parse(id), p_reaction: input.reaction, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
    async removeMessage(request: Request, id: string) { try { return json(await deps.rpc("delete_owned_social_dm_message", { p_app_user_id: await owner(request, deps), p_message_id: uuid.parse(id) })); } catch (error) { return failure(error); } },
    async reportMessage(request: Request, id: string) { try { const input = reportInput.parse(await body(request)); return json(await deps.rpc("report_social_dm_message", { p_app_user_id: await owner(request, deps), p_message_id: uuid.parse(id), p_reason: input.reason, p_details: input.details ?? null, p_request_id: input.requestId })); } catch (error) { return failure(error); } },
  };
}
