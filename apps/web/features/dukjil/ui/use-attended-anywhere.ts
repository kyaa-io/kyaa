"use client";
import { groupListSchema } from "@/features/groups/domain/contracts";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { parseDukjilAttendanceList } from "../domain/dukjil-ui";

const parseList = (value: unknown) => groupListSchema.parse(value);
/** The joined pages read and the attendance read of '오늘의 덕질' (MyAttendanceList): the same two addresses, so the shared resource cache
 * answers both and this adds no request when that list is on screen. */
export const JOINED_PAGES_PATH = "/api/groups?mine=joined&limit=50";
export const attendanceListPath = (slugs: string) => `/api/me/attendance?creators=${slugs}`;

/** 261107-2 4차 M4-3: has the fan checked in on any joined page today? The 덕질 출석 mission counts any page's check-in, not only the
 * favorite's (an account without a favorite, or one that checked in elsewhere, used to stay at 0/1). `known` is false until both reads
 * answer; `failed` when either fails (callers fall back to what they knew). */
export function useAttendedAnywhereToday(enabled = true): { known: boolean; attended: boolean; failed: boolean } {
  const auth = useGroupRequest();
  const list = useGroupResource(enabled && auth.authenticated ? JOINED_PAGES_PATH : null, parseList);
  const slugs = (list.data?.items ?? []).filter(page => page.celebrityId && page.slug).slice(0, 50).map(page => encodeURIComponent(page.slug!)).join(",");
  const status = useGroupResource(slugs ? attendanceListPath(slugs) : null, parseDukjilAttendanceList);
  const attended = (status.data?.items ?? []).some(item => item.attendedToday);
  const failed = Boolean(list.error || status.error);
  const known = attended || (Boolean(list.data) && (!slugs || Boolean(status.data)));
  return { known, attended, failed };
}
