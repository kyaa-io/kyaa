import "server-only";
/** The 케미 tab is open only when CHEMI_TAB is exactly "true". Unset or any other value keeps it closed (production default). */
export function chemiEnabled() { return process.env.CHEMI_TAB === "true"; }
/** DEV·미리보기에서만 열리는 구성(궁합 상대·별자리 운세 등). 운영 조합은 false. 케미 탭 홈과 같은 판정이다. */
export function chemiPreview() { return process.env.APP_ENV ? process.env.APP_ENV === "dev" : process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"; }

export function chemiTopupEnabled() {
  return chemiEnabled() && process.env.APP_ENV === "dev" && process.env.CHEMI_TOPUP_ENABLED === "true";
}
