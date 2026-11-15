import { z } from "zod";
import { loadServerEnv } from "@/server/config/env";
import { createHomeBannerRepository } from "@/server/content/home-banner-repository";
import { publicContentCacheHeaders } from "@/server/cache/public-content-cache";
import { APP_LOCALES } from "@/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({ area: z.enum(["home", "fanpage"]), locale: z.enum(APP_LOCALES).default("ko") }).strict();

/** Published slot banners of one area, one per slot. Public and cached like the other published content; an admin save clears the cache. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = query.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].some(key => params.getAll(key).length > 1)) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const environment = loadServerEnv();
    const slots = await createHomeBannerRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }).listSlots(parsed.data.locale === "ko" ? "ko" : "en", parsed.data.area);
    return Response.json({ slots }, { headers: publicContentCacheHeaders() });
  } catch {
    return Response.json({ error: "BANNER_SLOTS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
