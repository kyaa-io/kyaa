import type { DukjilCatalogView, DukjilTodayView } from "@/features/dukjil/domain/dukjil-ui";

/**
 * Fan temperature (261107-2 D2): today's finished daily missions ÷ today's daily missions × 100, a whole number 0..100.
 * Daily missions are the ones the 덕질 card counts in "all clear": check-in, and every catalog activity with a daily limit.
 * A mission is finished when check-in is done, or the server says nothing remains today.
 * No value (null) when the policy is off, today's read is missing, or there is no daily mission, so the header draws no temperature.
 */
export function fanTemperature(catalog: DukjilCatalogView | undefined, today: DukjilTodayView | undefined, attendedToday?: boolean) {
  const parts = temperatureParts(catalog, today, attendedToday);
  return parts ? parts.value : null;
}

export function temperatureParts(catalog: DukjilCatalogView | undefined, today: DukjilTodayView | undefined, attendedToday?: boolean) {
  if (!catalog || !today || !today.policyActive) return null;
  let total = 0, done = 0;
  for (const [key, rule] of Object.entries(catalog.rules)) {
    if (key === "checkin") {
      const checkedIn = attendedToday ?? today.attendance?.attendedToday;
      if (checkedIn === undefined) continue;
      total += 1; done += Number(checkedIn);
      continue;
    }
    const limit = typeof rule.dailyLimit === "number" && rule.dailyLimit > 0 ? rule.dailyLimit : null;
    const item = today.actions[key];
    if (limit === null || !item) continue;
    total += 1;
    if (item.remaining === 0 || item.count >= limit) done += 1;
  }
  if (total === 0) return null;
  return { done, total, value: temperatureValue(done, total) };
}

/** done ÷ total × 100 as a whole number 0..100. */
export function temperatureValue(done: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
}
