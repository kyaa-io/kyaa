/** A post or comment counts as edited once its revision moves past the first save, or its update time is later than its creation time. Comments carry no update time. */
export function isEdited(item: { createdAt: string; updatedAt?: string; revision?: number }) {
  if (item.revision !== undefined && item.revision > 1) return true;
  return item.updatedAt !== undefined && Date.parse(item.updatedAt) > Date.parse(item.createdAt);
}
