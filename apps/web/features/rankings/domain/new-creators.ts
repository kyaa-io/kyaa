export const HOME_CREATOR_SLOTS = 10;

export function selectNewCreators<T extends { slug: string }>(
  ranked: readonly { slug: string }[],
  candidates: readonly T[],
): T[] {
  const outside = (places: number) => {
    const visible = new Set(ranked.slice(0, places).map(({ slug }) => slug));
    return candidates.filter(({ slug }) => !visible.has(slug));
  };
  const two = outside(HOME_CREATOR_SLOTS - 2);
  return two.length >= 2 ? two.slice(0, 2) : outside(HOME_CREATOR_SLOTS - 1).slice(0, 1);
}
