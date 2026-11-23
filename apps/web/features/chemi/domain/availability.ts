import "server-only";
/** The 케미 tab is open only when CHEMI_TAB is exactly "true". Unset or any other value keeps it closed (production default). */
export function chemiEnabled() { return process.env.CHEMI_TAB === "true"; }
/**
 * DEV·미리보기에서만 여는 구성. 운영 조합(APP_ENV=prod)은 false.
 * 운영에서 계속 숨기는 것: 입구 주간 랭킹 · 질문하기 · '내일 알려 줘'(발송 예약이 dev 에만 있음).
 * 성장 탭 · 분류 칩 · MY 궁합 상대 목록 · 다른 날짜 운세 구매(10P)는 운영에서도 연다(11/23 운영 오픈 결정).
 */
export function chemiPreview() { return process.env.APP_ENV ? process.env.APP_ENV === "dev" : process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"; }

/** 케미 화면(클라이언트)에 내려 주는 기능 열림. 질문하기와 '내일 알려 줘'는 운영 조합에서 닫는다. */
export function chemiFeatures() {
  const preview = chemiPreview();
  return { ask: preview, reminders: preview };
}

export function chemiTopupEnabled() {
  return chemiEnabled() && process.env.APP_ENV === "dev" && process.env.CHEMI_TOPUP_ENABLED === "true";
}
