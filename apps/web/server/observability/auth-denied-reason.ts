import { AsyncLocalStorage } from "node:async_hooks";

// `http_auth_denied` 줄의 reason 값. 고정 목록만 쓰고, 회원 식별자·토큰·이메일·오류 메시지는 담지 않는다.
export const AUTH_DENIED_REASONS = [
  "user_missing",
  "user_inactive",
  "account_deleted",
  "active_account_required",
  "verified_email_required",
  "apple_reauth_required",
  "same_origin",
  "fan_session_revoked",
  "other",
] as const;
export type AuthDeniedReason = (typeof AUTH_DENIED_REASONS)[number];

export type RequestState = {
  error?: { name: string; code: string | null; digest: string | null; routePath: string | null };
  authDeniedReason?: AuthDeniedReason;
};

// instrumentation.ts(요청 훅)와 라우트 코드는 서로 다른 번들이라 모듈 변수를 나눠 갖는다. 같은 저장소를 쓰도록 globalThis에 둔다.
const STORE_KEY = Symbol.for("kyaa.httpLog.requestState");

export function requestStateStore(): AsyncLocalStorage<RequestState> {
  const holder = globalThis as unknown as { [STORE_KEY]?: AsyncLocalStorage<RequestState> };
  return (holder[STORE_KEY] ??= new AsyncLocalStorage<RequestState>());
}

/** 401·403을 돌려주기 직전에 부른다. 요청 맥락이 없으면(시험·스크립트) 아무 일도 하지 않는다. */
export function recordAuthDeniedReason(reason: AuthDeniedReason): void {
  const state = requestStateStore().getStore();
  if (state) state.authDeniedReason = reason;
}

const REASON_BY_AUTH_ERROR_CODE: Record<string, AuthDeniedReason> = {
  VERIFIED_EMAIL_REQUIRED: "verified_email_required",
  APPLE_REAUTHENTICATION_REQUIRED: "apple_reauth_required",
};

/** AuthError.code에 대응하는 사유가 있으면 기록한다. 없는 코드는 건드리지 않아 로그에 `other`로 남는다. */
export function recordAuthDeniedReasonFromError(error: unknown): void {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const reason = typeof code === "string" ? REASON_BY_AUTH_ERROR_CODE[code] : undefined;
  if (reason) recordAuthDeniedReason(reason);
}
