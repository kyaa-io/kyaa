type ThreadItem = { id: string; parentId?: string | null; createdAt: string };

/**
 * The comments API returns one flat newest-first page. Show each reply directly under its parent,
 * oldest reply first, and keep parent comments in the order the page gave them. A reply whose parent
 * is not on the loaded page (or was deleted) keeps its original position. A reply to a reply goes under
 * the topmost parent on the page, and an item caught in a parent loop stays in place, so every item
 * appears exactly once (a repeated id is shown only once).
 */
export function threadComments<T extends ThreadItem>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  const unique = [...byId.values()];
  const topOf = (item: T): T => {
    const seen = new Set([item.id]);
    let current = item;
    while (current.parentId && byId.has(current.parentId)) {
      const parent = byId.get(current.parentId)!;
      if (seen.has(parent.id)) return item;
      seen.add(parent.id);
      current = parent;
    }
    return current;
  };
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of unique) {
    const top = topOf(item);
    if (top.id === item.id) roots.push(item);
    else children.set(top.id, [...(children.get(top.id) ?? []), item]);
  }
  for (const list of children.values()) list.sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1);
  return roots.flatMap(item => [item, ...(children.get(item.id) ?? [])]);
}
