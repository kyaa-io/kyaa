import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { createCreatorAvatarReader, type CreatorAvatarReader } from "./creator-avatars";
import { snsIngestSlug } from "@/server/sns-ingest/source-url";
import { readUnverifiedCreators } from "@/server/rankings/unlisted-creators";
import { homeGalleryPageSchema, homeShortsPageSchema, homeShortsSchema, type HomeGalleryPage, type HomeShort } from "@/features/home/domain/home-gallery";

type Db = Pick<SupabaseClient, "rpc">;
const SHORTS_READ = 12;
const SHORTS_POOL = 60;
/** Video ids per like-count read (the SQL limit) and how many of those reads run at once. */
const LIKES_BATCH = 200;
const LIKES_PARALLEL = 3;
export class HomeGalleryRepositoryError extends Error {}

const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:\d{2})?)$/;
const sortKeySchema = z.object({ rank: z.number().int().min(1).max(2147483647), at: z.string().regex(iso).refine(value => !Number.isNaN(Date.parse(value))), id: z.string().regex(/^[0-9A-Za-z:_-]{1,200}$/) }).strict();
type SortKey = z.infer<typeof sortKeySchema>;
/** Gallery RPC answer: the page plus the sort key of its last photo, which is what the next read continues after. */
const keyPageSchema = homeGalleryPageSchema.extend({ last: sortKeySchema.nullable() }).strict()
  .refine(page => (page.items.at(-1)?.id ?? null) === (page.last?.id ?? null));

/**
 * Opaque cursor: the sort key (curation rank, time, id) of the last photo the reader got. The SQL read continues after that key, so a photo hidden,
 * unpublished or added in front of it cannot move the next page. A `{ o }` cursor (position) was issued before 2026-11-17 and is still read once.
 */
export function encodeHomeGalleryCursor(key: SortKey) { return Buffer.from(JSON.stringify({ r: key.rank, a: key.at, i: key.id })).toString("base64url"); }
const cursorSchema = z.union([
  z.object({ r: sortKeySchema.shape.rank, a: sortKeySchema.shape.at, i: sortKeySchema.shape.id }).strict().transform(value => ({ after: { rank: value.r, at: value.a, id: value.i } })),
  z.object({ o: z.number().int().min(0).max(10000) }).strict().transform(value => ({ offset: value.o })),
]);
type Cursor = z.output<typeof cursorSchema>;
export function decodeHomeGalleryCursor(value: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export class HomeGalleryRepository {
  constructor(private readonly db: Db, private readonly creatorAvatars?: CreatorAvatarReader,
    /** Slugs of fan-made (Unverified) creator pages: their photos and videos stay off the home, gallery and shorts lists. */
    private readonly unverifiedSlugs: () => Promise<ReadonlySet<string>> = async () => new Set()) {}

  private async withoutUnverified<T extends { creator?: { slug: string } }>(items: T[]): Promise<T[]> {
    const hidden = await this.unverifiedSlugs();
    return hidden.size ? items.filter(item => !item.creator || !hidden.has(item.creator.slug)) : items;
  }

  async listPublished(locale: "ko" | "en", input: { limit: number; cursor?: string | null }): Promise<HomeGalleryPage> {
    const cursor = input.cursor ? decodeHomeGalleryCursor(input.cursor) : { offset: 0 };
    if (cursor === null) throw new HomeGalleryRepositoryError("Invalid home gallery cursor");
    const from = "after" in cursor
      ? { p_after_rank: cursor.after.rank, p_after_at: cursor.after.at, p_after_id: cursor.after.id }
      : { p_offset: cursor.offset };
    const page = await this.readPage(locale, input.limit, from);
    return { items: await this.withoutUnverified(page.items), nextCursor: page.hasMore && page.last ? encodeHomeGalleryCursor(page.last) : null };
  }

  private async readPage(locale: "ko" | "en", limit: number, from: { p_offset: number } | { p_after_rank: number; p_after_at: string; p_after_id: string }, homePool = false) {
    const { data, error } = await this.db.rpc(homePool ? "read_home_gallery_mix" : "read_public_gallery_post_photos", { p_include_groups: process.env.KYAA_GROUPS_ENABLED === "true", p_locale: locale, p_limit: limit, ...from });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    return keyPageSchema.parse(data);
  }

  /** Read the selected public posts in rank order before applying the home mix. */
  async listPublishedPool(locale: "ko" | "en", input: { pages: number }): Promise<HomeGalleryPage> {
    const pages = await Promise.all(Array.from({ length: input.pages }, (_, index) => this.readPage(locale, 24, { p_offset: index * 24 }, true)));
    const seen = new Set<string>();
    const items = pages.flatMap(page => page.items).filter(item => !seen.has(item.id) && seen.add(item.id));
    const last = pages.at(-1);
    return { items: await this.withoutUnverified(items), nextCursor: last?.hasMore && last.last ? encodeHomeGalleryCursor(last.last) : null };
  }

  /** The creator's own profile photo, so a short's caption shows the real avatar. A creator without one keeps the default icon. */
  private async withAvatars(locale: "ko" | "en", items: HomeShort[]): Promise<HomeShort[]> {
    if (!items.length || !this.creatorAvatars) return items;
    const avatars = await this.creatorAvatars(locale, [...new Set(items.map(item => item.creator.slug))]);
    return items.map(item => avatars[item.creator.slug] ? { ...item, creator: { ...item.creator, avatar: avatars[item.creator.slug] } } : item);
  }

  private async withThumbnails(items: HomeShort[]): Promise<HomeShort[]> {
    if (!items.length) return items;
    const { data, error } = await this.db.rpc("read_public_video_thumbnails", { p_hrefs: items.map(item => item.href) });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    const covers = z.record(z.string(), z.string().regex(/^\/api\/public\/notice-media\/[0-9a-f-]{36}\?variant=thumbnail$/)).parse(data);
    return items.map(item => covers[item.href] ? { ...item, thumbnail: covers[item.href] } : item);
  }

  /** An Instagram reel is shown only with the cover the site stored for it; one without a cover is left out here so paging counts only what can be drawn. */
  private async withCoverRule(items: HomeShort[]): Promise<HomeShort[]> {
    return (await this.withThumbnails(items)).filter(item => item.platform !== "instagram" || item.thumbnail);
  }

  /** The home rail uses curator order. The catalog reads all public videos by publication date. */
  private async shortsPool(locale: "ko" | "en", curated = true): Promise<HomeShort[]> {
    const pages = await Promise.all(Array.from({ length: SHORTS_POOL / SHORTS_READ }, async (_, index) => {
      const { data, error } = await this.db.rpc(curated ? "read_curated_home_shortform_page" : "read_public_home_shortform_page", { p_locale: locale, p_offset: index * SHORTS_READ, p_limit: SHORTS_READ });
      if (error) throw new HomeGalleryRepositoryError(error.message);
      return homeShortsPageSchema.parse(data);
    }));
    const seen = new Set<string>();
    const items = pages.flatMap(page => page.items).filter(item => !seen.has(item.id) && seen.add(item.id));
    const shown = await this.withCoverRule(items);
    return this.withoutUnverified(shown);
  }

  /** Public like totals for the videos, a few reads of up to LIKES_BATCH ids; a video without a total (not public) counts 0. */
  private async readLikeCounts(videoIds: readonly string[]): Promise<Record<string, number>> {
    const ids = [...new Set(videoIds)];
    const batches = Array.from({ length: Math.ceil(ids.length / LIKES_BATCH) }, (_, index) => ids.slice(index * LIKES_BATCH, (index + 1) * LIKES_BATCH));
    const likes: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
    let next = 0;
    const worker = async () => {
      for (let batch = batches[next++]; batch; batch = batches[next++]) {
        const { data, error } = await this.db.rpc("read_public_shortform_like_counts", { p_video_ids: batch });
        if (error) throw new HomeGalleryRepositoryError(error.message);
        const counts = z.record(z.string(), z.number().int().nonnegative()).parse(data);
        for (const id of batch) likes[id] = counts[id] ?? 0;
      }
    };
    await Promise.all(Array.from({ length: Math.min(LIKES_PARALLEL, batches.length) }, worker));
    return likes;
  }

  /** A single stable catalog lets sorting and creator chips operate on the same public videos. */
  async listShortsCatalog(locale: "ko" | "en") {
    const items = await this.shortsPool(locale, false);
    for (let offset = SHORTS_POOL; offset < 10000; offset += SHORTS_READ) {
      const { data, error } = await this.db.rpc("read_public_home_shortform_page", { p_locale: locale, p_offset: offset, p_limit: SHORTS_READ });
      if (error) throw new HomeGalleryRepositoryError(error.message);
      const page = homeShortsPageSchema.parse(data);
      items.push(...await this.withoutUnverified(await this.withCoverRule(page.items)));
      if (!page.hasMore) break;
    }
    const likes = await this.readLikeCounts(items.map(item => item.videoId));
    const catalogItems = items.map(item => item.platform === "youtube" ? item : { ...item, sourceNoticeSlug: snsIngestSlug(item.platform, item.videoId) });
    return { items: await this.withAvatars(locale, catalogItems), likes };
  }

  async listShorts(locale: "ko" | "en", input: { limit: number }): Promise<readonly HomeShort[]> {
    const items = (await this.shortsPool(locale)).slice(0, input.limit);
    return this.withAvatars(locale, items);
  }

  async listShortsPage(locale: "ko" | "en", input: { offset: number; limit: number }) {
    const pool = await this.shortsPool(locale);
    const items = pool.slice(input.offset, input.offset + input.limit);
    return { items: await this.withAvatars(locale, items), hasMore: input.offset + input.limit < pool.length };
  }
}

export function createHomeGalleryRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Db) {
  let unverified: Promise<ReadonlySet<string>> | undefined;
  return new HomeGalleryRepository(client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }), client ? undefined : createCreatorAvatarReader(), client ? undefined : () => unverified ??= readUnverifiedCreators().then(creators => creators.slugs));
}
