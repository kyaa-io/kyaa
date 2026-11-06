import { z } from "zod";
import { attendanceResultSchema, dukjilCatalogResponseSchema, type DukjilActionKey } from "@/features/passport/domain/dukjil-types";

export { attendanceResultSchema };
export type DukjilCatalogView = z.infer<typeof dukjilCatalogResponseSchema>;

// Contract §15. `read_dukjil_today(p_user, p_celebrity)` is the only shape the UI accepts; anything else is a failed read.
const attendanceStateSchema = z.object({
  attendedToday: z.boolean(),
  streak: z.number().int().nonnegative(),
  nextBonusIn: z.number().int().nonnegative().nullable(),
});
const actionStateSchema = z.object({
  count: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative().nullable(),
  stamped: z.boolean(),
});
const kstDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dukjilTodayViewSchema = z.discriminatedUnion("policyActive", [
  z.object({ kstDate, policyActive: z.literal(false) }),
  z.object({
    kstDate,
    policyActive: z.literal(true),
    totalPoints: z.number().int().nonnegative(),
    actions: z.record(z.string(), actionStateSchema),
    attendance: attendanceStateSchema.nullable(),
    hasPassport: z.boolean().nullable(),
  }),
]);
export type DukjilTodayView = z.infer<typeof dukjilTodayViewSchema>;
export type DukjilActiveToday = Extract<DukjilTodayView, { policyActive: true }>;

export const dukjilAttendanceListSchema = z.object({
  kstDate,
  items: z.array(attendanceStateSchema.extend({ celebrityId: z.string(), hasPassport: z.boolean() })),
});
export type DukjilAttendanceList = z.infer<typeof dukjilAttendanceListSchema>;

export const parseDukjilCatalog = (value: unknown) => dukjilCatalogResponseSchema.parse(value);
export const parseDukjilToday = (value: unknown) => dukjilTodayViewSchema.parse(value);
export const parseDukjilAttendanceList = (value: unknown) => dukjilAttendanceListSchema.parse(value);
export const parseAttendanceResult = (value: unknown) => attendanceResultSchema.parse(value);

/** The new UI exists only while the catalog carries rules. An empty or failed catalog keeps the legacy screens. */
export const catalogIsActive = (catalog: DukjilCatalogView | undefined) => Boolean(catalog && Object.keys(catalog.rules).length > 0);

/** Check-in numbers: `rules.checkin.{points,streakEvery,streakBonus}` only (contract §15). A missing number stays undefined. */
export function checkinNumbers(catalog: DukjilCatalogView | undefined) {
  const rule = catalog?.rules.checkin as Record<string, unknown> | undefined;
  const num = (value: unknown) => (typeof value === "number" ? value : undefined);
  return { points: num(rule?.points), bonus: num(rule?.streakBonus), every: num(rule?.streakEvery) };
}

/** Filled cells of the 7-day card; the bonus applies when the server says the next check-in is the bonus day. */
export function streakCells(streak: number, checkedIn: boolean, nextBonusIn: number | null) {
  const filled = checkedIn && streak > 0 && streak % 7 === 0 ? 7 : streak % 7;
  return { filled, todayIndex: checkedIn ? -1 : filled, bonusToday: !checkedIn && nextBonusIn === 1 };
}

/** Points of one cell of the 7-day card. A bonus day shows check-in plus bonus, the same sum the server pays that day. A missing number stays undefined. */
export function checkinDayPoints(numbers: ReturnType<typeof checkinNumbers>, day: number) {
  if (numbers.points === undefined) return undefined;
  return numbers.points + (isBonusDay(numbers, day) ? numbers.bonus ?? 0 : 0);
}
export const isBonusDay = (numbers: ReturnType<typeof checkinNumbers>, day: number) => Boolean(numbers.every && numbers.bonus && day % numbers.every === 0);

export const activeToday = (today: DukjilTodayView | undefined): DukjilActiveToday | undefined => (today?.policyActive ? today : undefined);

export function todayItem(today: DukjilTodayView | undefined, action: DukjilActionKey) {
  return activeToday(today)?.actions[action];
}

export function todayStampCount(today: DukjilTodayView | undefined) {
  const active = activeToday(today);
  return active ? Object.values(active.actions).filter(item => item.stamped).length : 0;
}

/** Reference page of the streak band: the joined fan page with the longest streak, the first in list order on a tie. None when every streak is 0. */
export function streakBandPage<T>(pages: readonly T[], streakOf: (page: T) => number) {
  let best: T | undefined, top = 0;
  for (const page of pages) { const streak = streakOf(page); if (streak > top) { best = page; top = streak; } }
  return best;
}

/** One mission card's progress: today's count against the daily limit, both from the server. Without a daily limit there is no bar. */
export function missionProgress(catalog: DukjilCatalogView | undefined, today: DukjilTodayView | undefined, action: DukjilActionKey) {
  const rule = catalog?.rules[action] as { points?: unknown; dailyLimit?: unknown } | undefined;
  const points = typeof rule?.points === "number" ? rule.points : undefined;
  const item = todayItem(today, action);
  if (!item) return { points, count: undefined, limit: null as number | null, remaining: null as number | null, done: false };
  const limit = typeof rule?.dailyLimit === "number" && rule.dailyLimit > 0 ? rule.dailyLimit : item.remaining === null ? null : item.count + item.remaining;
  return { points, count: item.count, limit: limit !== null && limit > 0 ? limit : null, remaining: item.remaining, done: item.remaining === 0 };
}
