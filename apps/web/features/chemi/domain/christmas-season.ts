export const christmasSeason = {
  opensAt: "2026-12-01T00:00:00+09:00",
  closesAt: "2026-12-26T00:00:00+09:00",
  holidayDates: ["2026-12-24", "2026-12-25"],
} as const;

export function christmasAvailable(preview: boolean, now = Date.now()) {
  return preview || (now >= Date.parse(christmasSeason.opensAt) && now < Date.parse(christmasSeason.closesAt));
}
