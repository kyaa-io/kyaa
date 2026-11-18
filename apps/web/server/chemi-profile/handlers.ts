import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import {
  chemiBirthErasedSchema, chemiBirthRequestSchema, chemiBirthSavedSchema, chemiPartnerCreateSchema, chemiPartnerCreatedSchema,
  chemiPartnerDeleteSchema, chemiPartnerDeletedSchema, chemiProfileSchema,
} from "@/features/chemi/domain/contracts/profile";
import { boundedJson, CertificationBodyError } from "@/server/certification/certification-http";
import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { chemiPartnerFingerprint } from "./fingerprint";

// 케미 프로필 API(설계 arch-chemi r3 §3 프로필 줄). 판단은 SQL 함수가 하고 여기서는 요청·응답 꼴만 본다.
// 생일·상대 저장은 r4 v2 함수만 부른다(옛 chemi_save_birth·chemi_add_partner·chemi_delete_partner 는 service_role 권한 회수).
// 생일 지우기(동의 철회)는 feature:* 를 보지 않는다. CHEMI_TAB 이 꺼져 있으면 모든 경로가 404 다.

export interface ChemiProfileDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
}

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const STATUS: Record<string, number> = {
  CHEMI_UNDER_14: 403, CHEMI_ACCOUNT_RESTRICTED: 403, CHEMI_EDIT_LIMIT: 409, CHEMI_PARTNER_FULL: 409, CHEMI_ACCOUNT_CLOSED: 403, CHEMI_INVALID: 400,
};

function failure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "UNAUTHORIZED" : error.code } }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof CertificationBodyError) {
    return Response.json({ error: { code: "CHEMI_INVALID" } }, { status: 400, headers });
  }
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find((known) => message === known);
  if (code) return Response.json({ error: { code } }, { status: STATUS[code], headers });
  return Response.json({ error: { code: "CHEMI_UNAVAILABLE" } }, { status: 503, headers });
}

function handler(run: (request: Request, deps: ChemiProfileDependencies, user: string) => Promise<Response>) {
  return (deps: ChemiProfileDependencies) => async (request: Request) => {
    const closed = chemiClosedResponse();
    if (closed) return closed;
    try {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      return await run(request, deps, appUserId);
    } catch (error) {
      return failure(error);
    }
  };
}

const ok = (body: unknown, status = 200) => Response.json(body, { status, headers });
const NO_PLACE = { p_place_code: null, p_lat: null, p_lon: null, p_tz: null };

export function createChemiProfileHandlers(deps: ChemiProfileDependencies) {
  return {
    getProfile: handler(async (_request, d, user) => ok(chemiProfileSchema.parse(await d.rpc("chemi_read_profile", { p_user: user }))))(deps),

    putBirth: handler(async (request, d, user) => {
      const input = chemiBirthRequestSchema.parse(await boundedJson(request, 2048));
      try {
        // 장소 코드·좌표 표(STAR-2)가 들어오기 전에는 코드를 받지 않는다: 글자 장소는 이름으로만, 계산은 '장소 모름'.
        const saved = chemiBirthSavedSchema.parse(await d.rpc("chemi_save_birth_v2", {
          p_user: user, p_birth_date: input.birthDate, p_calendar: input.calendar, p_birth_time: input.birthTime,
          p_precision: input.timePrecision, p_gender: input.gender, p_birth_place: input.birthPlace, ...NO_PLACE, p_term_side: null,
          p_consent_version: CHEMI_BIRTH_CONSENT_VERSION,
        }));
        return ok({ ageBand: saved.ageBand, edited: saved.edited, editableFrom: saved.editableFrom });
      } catch (error) {
        // SQL 오류는 메시지만 건너오므로, 다시 고칠 수 있는 날짜는 저장된 프로필에서 읽는다.
        if (error instanceof Error && error.message === "CHEMI_EDIT_LIMIT") {
          const profile = chemiProfileSchema.parse(await d.rpc("chemi_read_profile", { p_user: user }));
          return Response.json({ error: { code: "CHEMI_EDIT_LIMIT", editableFrom: profile.birth?.editableFrom ?? null } }, { status: 409, headers });
        }
        throw error;
      }
    })(deps),

    deleteBirth: handler(async (_request, d, user) => ok({ erased: chemiBirthErasedSchema.parse(await d.rpc("chemi_withdraw_birth_consent", { p_user: user })) }))(deps),

    postPartner: handler(async (request, d, user) => {
      const input = chemiPartnerCreateSchema.parse(await boundedJson(request, 2048));
      const created = chemiPartnerCreatedSchema.parse(await d.rpc("chemi_add_partner_v2", {
        p_user: user, p_nickname: input.nickname, p_birth_date: input.birthDate, p_calendar: input.calendar, p_birth_time: input.birthTime,
        p_precision: input.timePrecision, p_gender: input.gender, p_source: input.source, ...NO_PLACE,
      }));
      return ok({ partnerId: created.partnerId }, 201);
    })(deps),

    deletePartner: handler(async (request, d, user) => {
      const input = chemiPartnerDeleteSchema.parse(await boundedJson(request, 512));
      const notFound = () => Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
      // 지문 줄(궁합 결과)을 함께 지우려면 지금 저장된 상대 입력으로 지문을 만든다.
      const partner = chemiProfileSchema.parse(await d.rpc("chemi_read_profile", { p_user: user })).partners.find((p) => p.id === input.partnerId);
      if (!partner) return notFound();
      const salt = z.string().parse(await d.rpc("chemi_fp_salt", { p_user: user }));
      const result = chemiPartnerDeletedSchema.parse(await d.rpc("chemi_delete_partner_v2", {
        p_user: user, p_partner: input.partnerId, p_fp: chemiPartnerFingerprint(salt, partner),
      }));
      return result.deleted ? ok(result) : notFound();
    })(deps),
  };
}

// 생일 저장 동의 문구의 판. 문구가 바뀌면 올린다(저장 시각과 함께 chemi_profiles 에 남는다).
export const CHEMI_BIRTH_CONSENT_VERSION = "chemi-birth-v1";
