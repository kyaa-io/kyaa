import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { createCreatorAvatarReader, type CreatorAvatarReader } from "./creator-avatars";
import { homeGalleryPageSchema, homeShortsPageSchema, homeShortsSchema, type HomeGalleryPage, type HomeShort } from "@/features/home/domain/home-gallery";

type Db = Pick<SupabaseClient, "rpc">;
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

  async listShorts(locale: "ko" | "en", input: { limit: number }): Promise<readonly HomeShort[]> {
    const { data, error } = await this.db.rpc("read_public_home_shortform", { p_locale: locale, p_limit: input.limit });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    return this.withAvatars(locale, await this.withThumbnails(homeShortsSchema.parse(data)));
  }

  async listShortsPage(locale: "ko" | "en", input: { offset: number; limit: number }) {
    const { data, error } = await this.db.rpc("read_public_home_shortform_page", { p_locale: locale, p_offset: input.offset, p_limit: input.limit });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    const page = homeShortsPageSchema.parse(data);
    return { ...page, items: await this.withAvatars(locale, await this.withThumbnails(page.items)) };
  }
}

export function createHomeGalleryRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Db) {
  return new HomeGalleryRepository(client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }), client ? undefined : createCreatorAvatarReader());
}
