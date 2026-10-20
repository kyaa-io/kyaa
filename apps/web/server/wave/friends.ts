import "server-only";
import { z } from "zod";
import { parseWaveFriends, parseWaveLink, parseWaveProfile } from "@/features/fanpage/domain/wave-friends";
import { boundedJson, json, locale } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const id = z.uuid();
const requestId = z.object({ requestId: id });
const mutation = z.object({ id, status: z.string().optional(), createdAt: z.iso.datetime({ offset: true }).optional(), firstMessageId: id.optional(), replayed: z.boolean().optional(), requestId: id.optional() });
const messages = z.object({ messages: z.array(z.object({ id, text: z.string().min(1).max(2000), createdAt: z.iso.datetime({ offset: true }), isMine: z.boolean() })).max(100), hasMore: z.boolean() });
const socialStatuses: Record<string, number> = { SOCIAL_NOT_FOUND: 404, SOCIAL_FORBIDDEN: 403, SOCIAL_BLOCKED: 403, SOCIAL_CONFLICT: 409, SOCIAL_IDEMPOTENCY_CONFLICT: 409, SOCIAL_RATE_LIMITED: 429 };

function checked<T>(parse: (value: unknown) => T, value: unknown): T {
  try { return parse(value); } catch { throw new Error("FAN_WEB_UNAVAILABLE"); }
}

export function createWaveFriendHandlers(deps: Pick<FanpageDependencies, "authorize" | "rpc">) {
  const run = async (request: Request, action: (owner: string) => Promise<unknown>) => {
    try {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      return json(await action(appUserId));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      return socialStatuses[code] ? json({ error: { code } }, socialStatuses[code]) : contentFailure(error);
    }
  };
  const language = (request: Request) => {
    const value = locale(request);
    if (!value) throw new Error("FAN_WEB_INVALID_INPUT");
    return value;
  };
  return {
    list: (request: Request) => run(request, async owner => checked(parseWaveFriends, await deps.rpc("read_owned_kyaa_wave_friends", { p_app_user_id: owner, p_locale: language(request) }))),
    link: (request: Request) => run(request, async owner => checked(parseWaveLink, await deps.rpc("read_owned_kyaa_wave_profile_link", { p_app_user_id: owner }))),
    profile: (request: Request, token: string) => run(request, async owner => checked(parseWaveProfile, await deps.rpc("resolve_kyaa_wave_profile_link", { p_app_user_id: owner, p_token: id.parse(token), p_locale: language(request) }))),
    request: (request: Request) => run(request, async owner => {
      const body = requestId.extend({ profileId: id }).strict().parse(await boundedJson(request));
      return checked(mutation.parse, await deps.rpc("request_kyaa_wave_friend", { p_app_user_id: owner, p_profile_id: body.profileId, p_request_id: body.requestId }));
    }),
    resolve: (request: Request, friendshipId: string) => run(request, async owner => {
      id.parse(friendshipId);
      const body = requestId.extend({ action: z.enum(["accept", "reject", "cancel", "unfriend"]) }).strict().parse(await boundedJson(request));
      return checked(mutation.parse, await deps.rpc("resolve_kyaa_wave_friend", { p_app_user_id: owner, p_friendship_id: friendshipId, p_action: body.action, p_request_id: body.requestId }));
    }),
    messages: (request: Request, profileId: string) => run(request, async owner => checked(messages.parse, await deps.rpc("read_kyaa_wave_friend_messages", { p_app_user_id: owner, p_profile_id: id.parse(profileId) }))),
    send: (request: Request, profileId: string) => run(request, async owner => {
      id.parse(profileId);
      const body = requestId.extend({ text: z.string().trim().min(1).max(1000) }).strict().parse(await boundedJson(request));
      return checked(mutation.parse, await deps.rpc("send_kyaa_wave_friend_message", { p_app_user_id: owner, p_profile_id: profileId, p_body: body.text, p_request_id: body.requestId }));
    }),
  };
}
