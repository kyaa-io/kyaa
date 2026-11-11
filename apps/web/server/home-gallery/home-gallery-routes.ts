import "server-only";
import { z } from "zod";
import { publicContentCacheHeaders } from "../cache/public-content-cache";
import { HomeGalleryRepositoryError, type HomeGalleryRepository } from "./home-gallery-repository";

const publicQuerySchema = z.object({ locale: z.enum(["ko", "en"]).default("ko"), cursor: z.string().min(1).max(256).optional() }).strict();

/** GET /api/public/gallery?locale=&cursor= — 24 per page, a repeated or unknown key is refused. */
export function createPublicHomeGalleryHandler(getRepository: () => Pick<HomeGalleryRepository, "listPublished">) {
  return async function GET(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    const query = new Set(keys).size === keys.length ? publicQuerySchema.safeParse(Object.fromEntries(params)) : null;
    if (!query?.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    try {
      return Response.json(await getRepository().listPublished(query.data.locale, { limit: 24, cursor: query.data.cursor ?? null }), { headers: publicContentCacheHeaders() });
    } catch (error) {
      if (error instanceof HomeGalleryRepositoryError && /cursor/.test(error.message)) return Response.json({ error: { code: "INVALID_CURSOR" } }, { status: 400 });
      return Response.json({ error: { code: "HOME_GALLERY_UNAVAILABLE" } }, { status: 503 });
    }
  };
}

const shortsQuerySchema = z.object({ locale: z.enum(["ko", "en"]).default("ko"), offset: z.string().regex(/^(0|[1-9]\d{0,9})$/).transform(Number).refine(value => value <= 2147483635) }).strict();

/** GET /api/public/home-shorts?locale=&offset= — 12 per page for the shorts page's scroll loading; a repeated or unknown key is refused. */
export function createPublicHomeShortsHandler(getRepository: () => Pick<HomeGalleryRepository, "listShortsPage">) {
  return async function GET(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    const query = new Set(keys).size === keys.length ? shortsQuerySchema.safeParse(Object.fromEntries(params)) : null;
    if (!query?.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    try {
      return Response.json(await getRepository().listShortsPage(query.data.locale, { offset: query.data.offset, limit: 12 }), { headers: publicContentCacheHeaders() });
    } catch {
      return Response.json({ error: { code: "HOME_SHORTS_UNAVAILABLE" } }, { status: 503 });
    }
  };
}
