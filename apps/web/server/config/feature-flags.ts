type Env = Record<string, string | undefined>;

/** 찐팬 100 홈 게이지·상세 구역(2026-11-11 Staging 지정): KYAA_FEATURE_JJINFAN_GAUGE가 "true"/"false"면 그대로 따르고, 없으면 개발 데이터 환경(local·dev)에서만 켠다. 운영(production)은 켜라고 적지 않는 한 꺼진다. */
export function jjinfanGaugeEnabled(env: Env = process.env): boolean {
  const flag = env.KYAA_FEATURE_JJINFAN_GAUGE;
  if (flag === "true" || flag === "false") return flag === "true";
  return env.BYUS_DATA_ENVIRONMENT === "development";
}

/** Quiz learning requires explicit opt-in in every data environment. */
export function quizLearnEnabled(env: Env = process.env): boolean {
  return env.KYAA_FEATURE_QUIZ_LEARN === "true";
}

/** Server-only opt-in; production stays off until explicitly approved. */
export function signupRaffleEnabled(env: Env = process.env): boolean {
  return env.KYAA_FEATURE_SIGNUP_RAFFLE === "true";
}
