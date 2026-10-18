import "server-only";

import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { fanProfileSchema, NicknameValidationError, normalizeNickname } from "@/features/profile/domain/profile";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { AuthorizedFan } from "@/server/fan-auth/fan-auth-gate";

const bodySchema = z.object({
  nickname: z.string(), requestId: z.uuid(), policyVersion: z.string().min(1).max(80),
  termsAccepted: z.boolean(), privacyAccepted: z.boolean(),
}).strict();
const onboardingSchema = z.object({
  profile: fanProfileSchema,
  policyVersion: z.string().min(1),
  passport: z.object({ id: z.uuid(), issuedAt: z.iso.datetime({ offset: true }) }).strict().nullable(),
}).strict();
const availabilitySchema = z.object({ available: z.boolean(), reason: z.enum(["taken", "prohibited", "invalid"]).nullable() }).strict();
const headers = { "cache-control": "private, no-store", vary: "Authorization" };

export interface OnboardingDependencies {
  authorize(authorization: string): Promise<AuthorizedFan>;
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

function json(data: unknown, status = 200): Response { return Response.json(data, { status, headers }); }

function failure(error: unknown): Response {
  if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
  if (error instanceof NicknameValidationError) return json({ error: { code: error.reason === "prohibited" ? "NICKNAME_PROHIBITED" : "INVALID_NICKNAME" } }, 400);
  const markers: Record<string, [string, number]> = {
    ONBOARDING_CONSENT_REQUIRED: ["CONSENT_REQUIRED", 400], ONBOARDING_POLICY_CHANGED: ["ONBOARDING_POLICY_CHANGED", 400],
    ONBOARDING_REQUEST_CONFLICT: ["REQUEST_CONFLICT", 409], ONBOARDING_REQUEST_INVALID: ["INVALID_REQUEST", 400],
    FAN005_INVALID_NICKNAME: ["INVALID_NICKNAME", 400], FAN005_NICKNAME_PROHIBITED: ["NICKNAME_PROHIBITED", 400],
    FAN005_NICKNAME_TAKEN: ["NICKNAME_TAKEN", 409], FAN005_PROFILE_ALREADY_COMPLETED: ["PROFILE_ALREADY_COMPLETED", 409],
    FAN005_USER_UNAVAILABLE: ["FORBIDDEN", 403], FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: ["FORBIDDEN", 403], ACCOUNT_DELETED: ["FORBIDDEN", 403],
  };
  const marker = error instanceof Error ? Object.keys(markers).find((key) => error.message.includes(key)) : undefined;
  const [code, status] = marker ? markers[marker] : ["PROFILE_UNAVAILABLE", 503];
  return json({ error: { code } }, status);
}

export function createOnboardingHandlers(deps: OnboardingDependencies) {
  async function rpc(name: string, parameters: Record<string, unknown>) {
    const { data, error } = await deps.rpc(name, parameters);
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async get(request: Request): Promise<Response> {
      try {
        const fan = await deps.authorize(request.headers.get("authorization") ?? "");
        return json(onboardingSchema.parse(await rpc("get_owned_account_onboarding", { p_app_user_id: fan.appUserId })));
      } catch (error) { return failure(error); }
    },
    async complete(request: Request): Promise<Response> {
      try {
        const fan = await deps.authorize(request.headers.get("authorization") ?? "");
        let body: z.infer<typeof bodySchema>;
        try { body = bodySchema.parse(JSON.parse(await boundedText(request, 8192))); }
        catch { return json({ error: { code: "INVALID_REQUEST" } }, 400); }
        if (!body.termsAccepted || !body.privacyAccepted) return json({ error: { code: "CONSENT_REQUIRED" } }, 400);
        const nickname = normalizeNickname(body.nickname).nickname;
        return json(onboardingSchema.parse(await rpc("complete_owned_account_onboarding", {
          p_app_user_id: fan.appUserId, p_request_id: body.requestId, p_nickname: nickname,
          p_terms_accepted: body.termsAccepted, p_privacy_accepted: body.privacyAccepted, p_policy_version: body.policyVersion,
        })));
      } catch (error) { return failure(error); }
    },
    async availability(request: Request): Promise<Response> {
      try {
        const fan = await deps.authorize(request.headers.get("authorization") ?? "");
        const values = new URL(request.url).searchParams.getAll("nickname");
        if (values.length !== 1) return json({ available: false, reason: "invalid" });
        let nickname: string;
        try { nickname = normalizeNickname(values[0]).nickname; }
        catch (error) { return json({ available: false, reason: error instanceof NicknameValidationError && error.reason === "prohibited" ? "prohibited" : "invalid" }); }
        return json(availabilitySchema.parse(await rpc("read_owned_nickname_availability", { p_app_user_id: fan.appUserId, p_nickname: nickname })));
      } catch (error) { return failure(error); }
    },
  };
}
