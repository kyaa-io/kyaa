import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/server/data/client";
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
  constructor(private readonly db: Db) {}

  async listPublished(locale: "ko" | "en", input: { limit: number; cursor?: string | null }): Promise<HomeGalleryPage> {
    const offset = input.cursor ? decodeHomeGalleryCursor(input.cursor) : 0;
    if (offset === null) throw new HomeGalleryRepositoryError("Invalid home gallery cursor");
    const { data, error } = await this.db.rpc("read_public_home_gallery_photos", { p_locale: locale, p_offset: offset, p_limit: input.limit });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    const page = homeGalleryPageSchema.parse(data);
    return { items: page.items, nextCursor: page.hasMore ? encodeHomeGalleryCursor(offset + page.items.length) : null };
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
    return this.withThumbnails(homeShortsSchema.parse(data));
  }

  async listShortsPage(locale: "ko" | "en", input: { offset: number; limit: number }) {
    const { data, error } = await this.db.rpc("read_public_home_shortform_page", { p_locale: locale, p_offset: input.offset, p_limit: input.limit });
    if (error) throw new HomeGalleryRepositoryError(error.message);
    const page = homeShortsPageSchema.parse(data);
    return { ...page, items: await this.withThumbnails(page.items) };
  }
}

export function createHomeGalleryRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Db) {
  return new HomeGalleryRepository(client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
