import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";
import type { PhotoSet } from "@/features/media/domain/public-image";

// SQL authorizes each attachment for an anonymous reader before returning its private media route.
// This schema validates URL shape, not authorization. Never accept arbitrary paths or query overrides.
const homeGalleryImageUrlSchema = z.union([
  z.string().regex(/^\/api\/groups\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?variant=thumbnail$/),
  z.url({ protocol: /^https$/ }),
  z.string().regex(/^\/api\/(?:content-assets|groups\/media)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
]);

const uuidPath = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const fanPostPath = new RegExp(`^/c/[a-z0-9-]+/community/${uuidPath}$`);
export const groupPostPath = new RegExp(`^/pages/groups/${uuidPath}\\?tab=board&post=${uuidPath}$`);

export const homeGalleryPhotoSchema = z.object({
  isNew: z.literal(true).optional(),
  id: z.string().min(1).max(200),
  source: z.enum(["official_sns", "cms_upload", "fan_post", "group_post"]),
  image: z.object({ url: homeGalleryImageUrlSchema, width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  alt: z.string().min(1).max(300),
  creator: z.object({ slug: z.string().min(1), name: z.string().min(1) }).strict().optional(),
  sourceHref: z.union([z.string().regex(/^\/(c\/[a-z0-9-]+\/notices\/[a-z0-9-]+|live\/[a-z0-9-]+)$/), z.string().regex(fanPostPath), z.string().regex(groupPostPath)]).optional(),
}).strict().refine(photo => {
  if (photo.source === "fan_post") return photo.image.url.startsWith("/api/content-assets/") && fanPostPath.test(photo.sourceHref ?? "");
  if (photo.source === "group_post") return photo.image.url.startsWith("/api/groups/media/") && groupPostPath.test(photo.sourceHref ?? "");
  return !photo.image.url.startsWith("/api/groups/media/");
});
export type HomeGalleryPhoto = z.infer<typeof homeGalleryPhotoSchema>;

export const homeGalleryPageSchema = z.object({ items: z.array(homeGalleryPhotoSchema).max(24), hasMore: z.boolean() }).strict();
/** GET /api/public/gallery answer: the next 24 photos and the cursor after them (null at the end). */
export const homeGalleryResponseSchema = z.object({ items: z.array(homeGalleryPhotoSchema).max(24), nextCursor: z.string().min(1).nullable() }).strict();
export type HomeGalleryPage = Readonly<{ items: readonly HomeGalleryPhoto[]; nextCursor: string | null }>;

/** Public short-form videos from registered creators: YouTube shorts, and TikTok videos and Instagram reels the creator posted as source-only notices. */
const youtubeShortSchema = z.object({
  id: z.uuid(),
  platform: z.literal("youtube").default("youtube"),
  sourceNoticeSlug: z.string().regex(/^(instagram|tiktok)-[0-9a-f]{16}$/).optional(),
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
// An Instagram reel has no in-app player: the card opens the original post (`href`).
const instagramShortSchema = youtubeShortSchema.extend({
  platform: z.literal("instagram"),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  href: z.string().regex(/^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]{1,30}\/(?:p|reel)\/[A-Za-z0-9_-]{11}\/$/),
}).strict().refine(short => short.href.split("/")[5] === short.videoId);
export const homeShortSchema = z.union([youtubeShortSchema, tiktokShortSchema, instagramShortSchema]);
export type HomeShort = z.infer<typeof homeShortSchema>;
export const homeShortsSchema = z.array(homeShortSchema).max(12);
export const homeShortsPageSchema = z.object({ items: homeShortsSchema, hasMore: z.boolean() }).strict();

export const homeGalleryCopy: Record<AppLocale, { title: string; empty: string; viewAll: string; more: string }> = {
  ko: { title: "갤러리", empty: "아직 사진 없음", viewAll: "전체 보기", more: "더 보기" },
  get mn() { return this.en; },
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
