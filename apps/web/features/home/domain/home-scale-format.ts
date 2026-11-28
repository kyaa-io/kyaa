export function formatHomeScaleCompact(count: number, locale: string) {
  if (count < 10000) return count.toLocaleString(locale);
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
    roundingMode: "trunc",
  }).format(count);
}
