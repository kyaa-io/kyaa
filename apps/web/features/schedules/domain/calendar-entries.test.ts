import { describe, expect, it } from "vitest";
import { combinedCalendarDays } from "./calendar-entries";

const event = (date: string) => ({ id: `0000000${date.slice(-1)}-0000-4000-8000-000000000000`, slug: `live-${date}`, startsAt: `${date}T07:00:00+09:00`, effectiveStatus: "scheduled" as const, title: "정기 LIVE", celebrity: { name: "이퓨", image: "/x.webp" }, reservationState: null, hasBenefit: null });

describe("combinedCalendarDays", () => {
  it("shows past days as ended and later days as scheduled, by the KST clock", () => {
    const days = ["2026-11-06", "2026-11-08"].map(date => ({ date, events: [event(date)] }));
    const [past, next] = combinedCalendarDays({ month: "2026-11", timeZone: "Asia/Seoul", days }, [], [], new Map(), Date.parse("2026-11-07T15:00:00+09:00"));
    expect(past!.events[0]!.effectiveStatus).toBe("ended");
    expect(next!.events[0]!.effectiveStatus).toBe("scheduled");
  });
});
