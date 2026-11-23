export function usesFanPageNavigation(kind?: string | null, slug?: string | null) {
  return kind === "fan" || (kind === "brand" && slug === "knowingstudy");
}
