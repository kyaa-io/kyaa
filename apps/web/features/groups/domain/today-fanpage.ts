import { z } from "zod";

/** `read_today_fanpages` 한 행: 지난 7일(대상이 없으면 30일, 그래도 없으면 전체 = `periodDays` null) 활동 점수 순. */
export const todayFanpageRowSchema = z.object({
  slug: z.string().min(1), name: z.string().nullable(), periodDays: z.number().int().positive().nullable(),
  score: z.number().int().nonnegative(), posts: z.number().int().nonnegative(), comments: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(), missions: z.number().int().nonnegative(), fans: z.number().int().nonnegative(),
});
export const todayFanpageRowsSchema = z.array(todayFanpageRowSchema);
export type TodayFanpage = Omit<z.infer<typeof todayFanpageRowSchema>, "name"> & { name: string; imageUrl: string | null };
