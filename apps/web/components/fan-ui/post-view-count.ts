/** Historical likes predate view collection; omit incomparable counts without inventing views. */
export function visiblePostViews(views: number | null | undefined, likes: number | null | undefined) {
  return typeof views === "number" && views >= (likes ?? 0) ? views : undefined;
}
