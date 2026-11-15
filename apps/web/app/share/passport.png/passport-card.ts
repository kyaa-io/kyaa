/** `2026.11.20` in Korea time: the card's date is the same for every viewer and needs no localized month name (the card draws with Pretendard only). */
export function cardDate(issuedAt: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(issuedAt)).replaceAll("-", ".");
}

/** The bottom line of a passport's data page: `P<KYAA<ELINA<<<<…`, 36 characters. */
export function machineLine(slug: string) {
  return `P<KYAA<${slug.toUpperCase().replaceAll("-", "<")}`.slice(0, 36).padEnd(36, "<");
}
