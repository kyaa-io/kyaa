import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";
import type { PhotoSet } from "@/features/media/domain/public-image";

/**
 * Home gallery photos (read_public_home_gallery_photos, plan R8-DATA §4, narrowed 2026-11-09). Two sources only: an image of a
 * collected official SNS notice, or a CMS-uploaded image-role photo. `alt` is the notice's own image alt (original text) or the
 * alt the admin wrote; nothing is generated.
 */
// SQL admits relative URLs only after read_content_asset(NULL, id) confirms anonymous access.
// This schema validates URL shape, not authorization. Never accept arbitrary paths or query overrides.
const homeGalleryImageUrlSchema = z.union([
  z.url({ protocol: /^https$/ }),
  z.string().length(56).regex(/^\/api\/content-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
]);

export const homeGalleryPhotoSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.enum(["official_sns", "cms_upload"]),
  image: z.object({ url: homeGalleryImageUrlSchema, width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  alt: z.string().min(1).max(300),
  creator: z.object({ slug: z.string().min(1), name: z.string().min(1) }).strict().optional(),
  sourceHref: z.string().regex(/^\/(c\/[a-z0-9-]+\/notices\/[a-z0-9-]+|live\/[a-z0-9-]+)$/).optional(),
}).strict();
export type HomeGalleryPhoto = z.infer<typeof homeGalleryPhotoSchema>;

export const homeGalleryPageSchema = z.object({ items: z.array(homeGalleryPhotoSchema).max(24), hasMore: z.boolean() }).strict();
export type HomeGalleryPage = Readonly<{ items: readonly HomeGalleryPhoto[]; nextCursor: string | null }>;

/** Public short-form videos from registered creators: YouTube shorts, and TikTok videos the creator posted as source-only notices. */
const youtubeShortSchema = z.object({
  id: z.uuid(),
  platform: z.literal("youtube").default("youtube"),
  thumbnail: z.string().regex(/^\/api\/public\/notice-media\/[0-9a-f-]{36}\?variant=thumbnail$/).optional(),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1).max(300),
  creator: z.object({ slug: z.string().min(1), name: z.string().min(1), avatar: z.object({ src: z.string().min(1), photos: z.custom<PhotoSet>().optional() }).strict().optional() }).strict(),
  href: z.string().regex(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/),
  liveHref: z.string().regex(/^\/live\/[a-z0-9-]+$/).optional(),
}).strict();
const tiktokShortSchema = youtubeShortSchema.extend({
  platform: z.literal("tiktok"),
  videoId: z.string().regex(/^[0-9]{15,25}$/),
  href: z.string().regex(/^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9._]{1,64}\/video\/[0-9]{15,25}$/),
}).strict().refine(short => short.href.endsWith(`/video/${short.videoId}`));
export const homeShortSchema = z.union([youtubeShortSchema, tiktokShortSchema]);
export type HomeShort = z.infer<typeof homeShortSchema>;
export const homeShortsSchema = z.array(homeShortSchema).max(12);
export const homeShortsPageSchema = z.object({ items: homeShortsSchema, hasMore: z.boolean() }).strict();

export const homeGalleryCopy: Record<AppLocale, { title: string; empty: string; viewAll: string; more: string }> = {
  ko: { title: "갤러리", empty: "아직 사진 없음", viewAll: "전체 보기", more: "더 보기" },
  en: { title: "Gallery", empty: "No photos yet", viewAll: "View all", more: "Show more" },
  ja: { title: "ギャラリー", empty: "写真はまだありません", viewAll: "すべて見る", more: "もっと見る" },
  "zh-Hans": { title: "图库", empty: "暂无照片", viewAll: "查看全部", more: "查看更多" },
  "zh-Hant": { title: "圖庫", empty: "目前沒有照片", viewAll: "查看全部", more: "查看更多" },
  es: { title: "Galería", empty: "Aún no hay fotos", viewAll: "Ver todo", more: "Ver más" },
  id: { title: "Galeri", empty: "Belum ada foto", viewAll: "Lihat semua", more: "Lihat lainnya" },
  vi: { title: "Thư viện ảnh", empty: "Chưa có ảnh", viewAll: "Xem tất cả", more: "Xem thêm" },
  th: { title: "แกลเลอรี", empty: "ยังไม่มีรูปภาพ", viewAll: "ดูทั้งหมด", more: "ดูเพิ่มเติม" },
  pt: { title: "Galeria", empty: "Ainda não há fotos", viewAll: "Ver tudo", more: "Ver mais" },
  fr: { title: "Galerie", empty: "Aucune photo pour l’instant", viewAll: "Tout voir", more: "Voir plus" },
  ru: { title: "Галерея", empty: "Пока нет фото", viewAll: "Смотреть все", more: "Показать ещё" },
};
