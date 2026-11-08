// KST(+09:00, no daylight saving) day boundary shared by the ranking basis line and the dukjil reset line (r5 R12·R21).
/** The KST midnight after a KST date (YYYY-MM-DD): when that day closes (rankings) or resets (dukjil today). */
export function kstMidnightAfter(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T00:00:00+09:00`;
}
