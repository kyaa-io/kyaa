// One server decision for the ad-gated ticket exchange (the env name still says TICKET). The unit meta tag, the CSP rewarded-ad
// allowance, the client ad request and the server routes all read this and nothing else.
// There are no default limits: a missing or non-positive value keeps the whole exchange closed.
export const REWARDED_SESSION_ENV = {
  ttlSeconds: "KYAA_REWARDED_AD_SESSION_TTL_SECONDS",
  minWatchSeconds: "KYAA_REWARDED_AD_MIN_WATCH_SECONDS",
  issueLimit: "KYAA_REWARDED_AD_ISSUE_LIMIT",
  issueWindowSeconds: "KYAA_REWARDED_AD_ISSUE_WINDOW_SECONDS",
  dailyCap: "KYAA_REWARDED_AD_DAILY_CAP",
} as const;
export type RewardedSessionConfig = { [K in keyof typeof REWARDED_SESSION_ENV]: number };
export type RewardedExchangeDecision =
  | { enabled: true; adUnit: string; session: RewardedSessionConfig }
  | { enabled: false; reason: "gate_closed" | "config_missing" };
const UNIT = /^\/\d+\/[A-Za-z0-9_./-]+$/;
export function positiveInteger(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9]\d{0,8}$/.test(value.trim()) ? Number(value.trim()) : undefined;
}
export function rewardedExchangeDecision(env: Record<string, string | undefined>): RewardedExchangeDecision {
  if (env.KYAA_REWARDED_TICKET_EXCHANGE_ENABLED !== "true") return { enabled: false, reason: "gate_closed" };
  const adUnit = env.KYAA_REWARDED_AD_UNIT?.trim();
  if (!adUnit || !UNIT.test(adUnit)) return { enabled: false, reason: "config_missing" };
  const ttlSeconds = positiveInteger(env[REWARDED_SESSION_ENV.ttlSeconds]);
  const minWatchSeconds = positiveInteger(env[REWARDED_SESSION_ENV.minWatchSeconds]);
  const issueLimit = positiveInteger(env[REWARDED_SESSION_ENV.issueLimit]);
  const issueWindowSeconds = positiveInteger(env[REWARDED_SESSION_ENV.issueWindowSeconds]);
  const dailyCap = positiveInteger(env[REWARDED_SESSION_ENV.dailyCap]);
  if (ttlSeconds === undefined || minWatchSeconds === undefined || issueLimit === undefined || issueWindowSeconds === undefined || dailyCap === undefined) {
    return { enabled: false, reason: "config_missing" };
  }
  const session: RewardedSessionConfig = { ttlSeconds, minWatchSeconds, issueLimit, issueWindowSeconds, dailyCap };
  return { enabled: true, adUnit, session };
}
