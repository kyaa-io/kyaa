import { kstMidnightAfter } from "../../../server/kst-midnight";

/** Callers supply server time; device time is used only as elapsed duration. */
export function koreanDateLineState(input: {
  locale: string;
  deviceTimeZone: string;
  serverNow: string;
  elapsedMs?: number;
}) {
  const serverMs = Date.parse(input.serverNow);
  const elapsed = input.elapsedMs ?? 0;
  if (!Number.isFinite(serverMs) || !Number.isFinite(elapsed) || elapsed < 0) {
    throw new RangeError("Invalid server time or elapsed duration");
  }
  const now = serverMs + elapsed;
  const day = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const midnight = Date.parse(kstMidnightAfter(day)!);
  const remaining = midnight - now;
  return {
    visible: input.locale !== "ko" || input.deviceTimeZone !== "Asia/Seoul",
    day,
    unit: remaining < 3600000 ? "minutes" as const : "hours" as const,
    count: remaining < 3600000 ? Math.ceil(remaining / 60000) : Math.ceil(remaining / 3600000),
  };
}
