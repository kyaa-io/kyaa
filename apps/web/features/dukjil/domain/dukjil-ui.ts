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

export const activeToday = (today: DukjilTodayView | undefined): DukjilActiveToday | undefined => (today?.policyActive ? today : undefined);

export function todayItem(today: DukjilTodayView | undefined, action: DukjilActionKey) {
  return activeToday(today)?.actions[action];
}

export function todayStampCount(today: DukjilTodayView | undefined) {
  const active = activeToday(today);
  return active ? Object.values(active.actions).filter(item => item.stamped).length : 0;
}
