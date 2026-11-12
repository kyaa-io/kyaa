import type { HomeGalleryPhoto } from "./home-gallery";

/**
 * The order the home gallery shows (사용자 2026-11-11 08:30 "갤러리 최대한 셀럽의 다양한 이미지"): newest first only decides the order *inside* one creator.
 * 1. One photo per post (`<notice>:<n>` / `<owner type>:<owner>:<role>` share the part before the last colon): the other cuts of a post come after everything else.
 * 2. Round-robin over creators (a creator ranks by the position of their newest photo; a photo without a creator counts as its own creator).
 * 3. The same creator never sits next to itself while another creator still has photos, so two photos of one creator are always apart.
 * Nothing is dropped: photos the rules hold back follow in their original order, so a short list keeps its length.
 */
const postOf = (photo: HomeGalleryPhoto) => photo.id.slice(0, Math.max(0, photo.id.lastIndexOf(":"))) || photo.id;
const creatorOf = (photo: HomeGalleryPhoto) => photo.creator?.slug ?? `~${photo.id}`;

export function diversifyGalleryPhotos(photos: readonly HomeGalleryPhoto[]): HomeGalleryPhoto[] {
  const seenPosts = new Set<string>();
  const firsts: HomeGalleryPhoto[] = [];
  const rest: HomeGalleryPhoto[] = [];
  for (const photo of photos) {
    const post = postOf(photo);
    if (seenPosts.has(post)) rest.push(photo); else { seenPosts.add(post); firsts.push(photo); }
  }
  return [...roundRobinByKey(firsts, creatorOf), ...roundRobinByKey(rest, creatorOf)];
}

/**
 * Round-robin over keys (creators): each round takes the oldest-queued item of every key in order of first appearance, and a round starts
 * with the first key that is not the one just shown, so a key is never repeated back to back while another key still has items.
 * Order inside one key is the input order (newest first for the callers). Nothing is dropped.
 */
export function roundRobinByKey<T>(list: readonly T[], keyOf: (item: T) => string): T[] {
  const queues = new Map<string, T[]>();
  for (const item of list) { const key = keyOf(item); (queues.get(key) ?? queues.set(key, []).get(key)!).push(item); }
  const result: T[] = [];
  let last = "";
  while (result.length < list.length) {
    const round = [...queues.entries()].filter(([, queue]) => queue.length);
    const start = round.findIndex(([key]) => key !== last);
    const turn = start > 0 ? [...round.slice(start), ...round.slice(0, start)] : round;
    for (const [key, queue] of turn) { result.push(queue.shift()!); last = key; }
  }
  return result;
}

/** Home Shorts (사용자 2026-11-12 "숏폼도 여러 셀럽 교차적으로"): creators take turns, newest first inside one creator. */
export function diversifyShorts<T extends { creator: { slug: string } }>(shorts: readonly T[]): T[] {
  return roundRobinByKey(shorts, short => short.creator.slug);
}
