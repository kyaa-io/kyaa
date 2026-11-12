import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { createCreatorAvatarReader, type CreatorAvatarReader } from "./creator-avatars";
import { diversifyShorts } from "@/features/home/domain/home-gallery-order";
import { homeGalleryPageSchema, homeShortsPageSchema, homeShortsSchema, type HomeGalleryPage, type HomeShort } from "@/features/home/domain/home-gallery";

type Db = Pick<SupabaseClient, "rpc">;
const SHORTS_READ = 12;
const SHORTS_POOL = 60;
export class HomeGalleryRepositoryError extends Error {}

/** Opaque offset cursor; the SQL read merges two sources newest first, so it pages by position. */
export function encodeHomeGalleryCursor(offset: number) { return Buffer.from(JSON.stringify({ o: offset })).toString("base64url"); }
const cursorSchema = z.object({ o: z.number().int().min(0).max(10000) }).strict();
export function decodeHomeGalleryCursor(value: string): number | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data.o : null;
  } catch { return null; }
}

export class HomeGalleryRepository {
  constructor(private readonly db: Db, private readonly creatorAvatars?: CreatorAvatarReader) {}

  async listPublished(locale: "ko" | "en", input: { limit: number; cursor?: string | null }): Promise<HomeGalleryPage> {
    const offset = input.cursor ? decodeHomeGalleryCursor(input.cursor) : 0;
    if (offset === null) throw new HomeGalleryRepositoryError("Invalid home gallery cursor");
    const { data, error } = await this.db.rpc("read_public_home_gallery_photos", { p_locale: locale, p_offset: offset, p_limit: input.limit });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    const page = homeGalleryPageSchema.parse(data);
    return { items: page.items, nextCursor: page.hasMore ? encodeHomeGalleryCursor(offset + page.items.length) : null };
  }

  /**
   * The newest `pages` × 24 photos in one list, for the home block that picks the most varied 12 from them (the newest 24 alone can be
   * one or two creators). The pages are read in parallel by offset; `nextCursor` continues after the last page read.
   */
  async listPublishedPool(locale: "ko" | "en", input: { pages: number }): Promise<HomeGalleryPage> {
    const pages = await Promise.all(Array.from({ length: input.pages }, async (_, index) => {
      const { data, error } = await this.db.rpc("read_public_home_gallery_photos", { p_locale: locale, p_offset: index * 24, p_limit: 24 });
      if (error) throw new HomeGalleryRepositoryError(error.message);
      return homeGalleryPageSchema.parse(data);
    }));
    const seen = new Set<string>();
    const items = pages.flatMap(page => page.items).filter(item => !seen.has(item.id) && seen.add(item.id));
    return { items, nextCursor: pages.at(-1)?.hasMore ? encodeHomeGalleryCursor(input.pages * 24) : null };
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

  /**
   * The newest SHORTS_POOL short-form videos, creators taking turns (사용자 2026-11-12 "숏폼도 여러 셀럽 교차적으로"). Paging is by position in
   * this diversified list, so the offset the shorts page and the rail send means the same on every read.
   */
  private async shortsPool(locale: "ko" | "en", diversify = true): Promise<HomeShort[]> {
    const pages = await Promise.all(Array.from({ length: SHORTS_POOL / SHORTS_READ }, async (_, index) => {
      const { data, error } = await this.db.rpc("read_public_home_shortform_page", { p_locale: locale, p_offset: index * SHORTS_READ, p_limit: SHORTS_READ });
      if (error) throw new HomeGalleryRepositoryError(error.message);
      return homeShortsPageSchema.parse(data);
    }));
    const seen = new Set<string>();
    const items = pages.flatMap(page => page.items).filter(item => !seen.has(item.id) && seen.add(item.id));
    return diversify ? diversifyShorts(items) : items;
  }

  /** A single stable catalog lets sorting and creator chips operate on the same public videos. */
  async listShortsCatalog(locale: "ko" | "en") {
    const items = await this.shortsPool(locale, false);
    for (let offset = SHORTS_POOL; offset < 10000; offset += SHORTS_READ) {
      const { data, error } = await this.db.rpc("read_public_home_shortform_page", { p_locale: locale, p_offset: offset, p_limit: SHORTS_READ });
      if (error) throw new HomeGalleryRepositoryError(error.message);
      const page = homeShortsPageSchema.parse(data);
      items.push(...page.items);
      if (!page.hasMore) break;
    }
    const popularity = await Promise.all(items.map(async (item) => {
      const { data, error } = await this.db.rpc("read_shortform_participation", { p_video_id: item.videoId, p_app_user_id: null });
      if (error) throw new HomeGalleryRepositoryError(error.message);
      return [item.videoId, data === null ? 0 : z.object({ likeCount: z.number().int().nonnegative() }).parse(data).likeCount] as const;
    }));
    const likes = Object.fromEntries(popularity);
    return { items: await this.withAvatars(locale, await this.withThumbnails(items)), likes };
  }

  async listShorts(locale: "ko" | "en", input: { limit: number }): Promise<readonly HomeShort[]> {
    const items = (await this.shortsPool(locale)).slice(0, input.limit);
    return this.withAvatars(locale, await this.withThumbnails(items));
  }

  async listShortsPage(locale: "ko" | "en", input: { offset: number; limit: number }) {
    const pool = await this.shortsPool(locale);
    const items = pool.slice(input.offset, input.offset + input.limit);
    return { items: await this.withAvatars(locale, await this.withThumbnails(items)), hasMore: input.offset + input.limit < pool.length };
  }
}

export function createHomeGalleryRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Db) {
  return new HomeGalleryRepository(client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }), client ? undefined : createCreatorAvatarReader());
}
