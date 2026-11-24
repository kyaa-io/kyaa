export const luckyMileageDailyLimits = {
  Bronze: 100,
  Silver: 120,
  Gold: 150,
  Platinum: 200,
  Diamond: 300,
} as const;

export function luckyMileageDailyLimit(tiers: readonly (keyof typeof luckyMileageDailyLimits)[]) {
  return tiers.reduce<number>((limit, tier) => Math.max(limit, luckyMileageDailyLimits[tier]), 100);
}

export function luckyMileageCost(count: number) {
  if (count !== 1 && count !== 10) throw new RangeError("LUCKY_INVALID_COUNT");
  return count * 10;
}

export function luckyMileageEnabled(env: Record<string, string | undefined>, source: "free" | "paid") {
  return env.BYUS_DATA_ENVIRONMENT === "development" &&
    env.LUCKY_MILEAGE_ENABLED === "true" &&
    (source === "free" || (source === "paid" && env.LUCKY_PAID_MILEAGE_APPROVED === "true"));
}
