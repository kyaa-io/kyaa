import { fanPostPath, groupPostPath, type HomeGalleryPhoto } from "./home-gallery";

/** Only original posts belong in the home photo selection. Filter before ranking and taking the first twelve. */
export function homeGalleryPostPhotos(photos: readonly HomeGalleryPhoto[]) {
  const ranked = photos.filter(photo =>
    (photo.source === "fan_post" && fanPostPath.test(photo.sourceHref ?? "")) ||
    (photo.source === "group_post" && groupPostPath.test(photo.sourceHref ?? "")) ||
    photo.source === "official_sns" && /^\/c\/[a-z0-9-]+\/notices\/[a-z0-9-]+$/.test(photo.sourceHref ?? "")
  );
  const selected = new Set<HomeGalleryPhoto>();
  const posts = new Set<string>();
  function takePosts(fan: boolean, limit: number) {
    for (const photo of ranked) {
      if (selected.size >= limit) break;
      const href = photo.sourceHref!;
      if ((photo.source !== "official_sns") === fan && !posts.has(href)) {
        posts.add(href);
        selected.add(photo);
      }
    }
  }
  takePosts(true, 3);
  takePosts(false, 10);
  for (const photo of ranked) {
    if (selected.size >= 10) break;
    if (photo.source === "official_sns") selected.add(photo);
  }
  return [...selected, ...diversifyGalleryPhotos(ranked.filter(photo => !selected.has(photo)))];
}

/**
 * The order the home gallery shows (사용자 2026-11-11 08:30 "갤러리 최대한 셀럽의 다양한 이미지"): newest first only decides the order *inside* one creator.
 * 0. 사용자 2026-11-15 19:0x: the first row holds each FEATURED_GALLERY_CREATORS creator's newest photo (a creator with none is skipped), then the rules below.
 * 1. One photo per post (`<notice>:<n>` / `<owner type>:<owner>:<role>` share the part before the last colon): the other cuts of a post come after everything else.
 * 2. Round-robin over creators (a creator ranks by the position of their newest photo; a photo without a creator counts as its own creator).
 * 3. The same creator never sits next to itself while another creator still has photos, so two photos of one creator are always apart.
 * Nothing is dropped: photos the rules hold back follow in their original order, so a short list keeps its length.
 */
const postOf = (photo: HomeGalleryPhoto) => photo.id.slice(0, Math.max(0, photo.id.lastIndexOf(":"))) || photo.id;
const creatorOf = (photo: HomeGalleryPhoto) => photo.creator?.slug ?? `~${photo.id}`;

/** Creators whose newest photo always opens the gallery, in this order. */
export const FEATURED_GALLERY_CREATORS = ["changha", "elina", "yuna"] as const;

export function diversifyGalleryPhotos(photos: readonly HomeGalleryPhoto[]): HomeGalleryPhoto[] {
  const seenPosts = new Set<string>();
  const firsts: HomeGalleryPhoto[] = [];
  const rest: HomeGalleryPhoto[] = [];
  for (const photo of photos) {
    const post = postOf(photo);
    if (seenPosts.has(post)) rest.push(photo); else { seenPosts.add(post); firsts.push(photo); }
  }
  const featured = FEATURED_GALLERY_CREATORS.flatMap(slug => firsts.find(photo => photo.creator?.slug === slug) ?? []);
  const taken = new Set(featured);
  const lastFeatured = featured.at(-1);
  return [...featured, ...roundRobinByKey(firsts.filter(photo => !taken.has(photo)), creatorOf, lastFeatured ? creatorOf(lastFeatured) : ""), ...roundRobinByKey(rest, creatorOf)];
}

/**
 * Round-robin over keys (creators): each round takes the oldest-queued item of every key in order of first appearance, and a round starts
 * with the first key that is not the one just shown, so a key is never repeated back to back while another key still has items.
 * `previousKey` is the key shown just before the list. Order inside one key is the input order (newest first for the callers). Nothing is dropped.
 */
export function roundRobinByKey<T>(list: readonly T[], keyOf: (item: T) => string, previousKey = ""): T[] {
  const queues = new Map<string, T[]>();
  for (const item of list) { const key = keyOf(item); (queues.get(key) ?? queues.set(key, []).get(key)!).push(item); }
  const result: T[] = [];
  let last = previousKey;
  while (result.length < list.length) {
    const round = [...queues.entries()].filter(([, queue]) => queue.length);
    const start = round.findIndex(([key]) => key !== last);
    const turn = start > 0 ? [...round.slice(start), ...round.slice(0, start)] : round;
    for (const [key, queue] of turn) { result.push(queue.shift()!); last = key; }
  }
  return result;
}

/** Home Shorts (사용자 2026-11-12 "숏폼도 여러 셀럽 교차적으로"): creators take turns, newest first inside one creator; YouTube, TikTok and Instagram shorts alternate where the creators allow it (사용자 2026-11-16 "인스타그램 릴스·유튜브 쇼츠도"). */
export function diversifyShorts<T extends { creator: { slug: string }; platform?: string }>(shorts: readonly T[]): T[] {
  const pending = roundRobinByKey(shorts, short => short.creator.slug);
  const result: T[] = [];
  while (pending.length) {
    const previous = result.at(-1);
    let index = pending.findIndex(item => item.platform !== previous?.platform && item.creator.slug !== previous?.creator.slug);
    // A creator never repeats while another creator is left; a repeated platform is the lesser fault.
    if (index < 0) index = pending.findIndex(item => item.creator.slug !== previous?.creator.slug);
    if (index < 0) index = pending.findIndex(item => item.platform !== previous?.platform);
    result.push(pending.splice(Math.max(0, index), 1)[0]);
  }
  return result;
}
