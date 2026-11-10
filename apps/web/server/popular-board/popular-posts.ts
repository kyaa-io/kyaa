import "server-only";
import { z } from "zod";
import { popularPostsPageSchema } from "@/features/popular-board/domain/popular-posts";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { feedFailure } from "@/server/fan-posts/feed";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

type PageImage = (source: "fan" | "group", pageRef: string, locale: "ko" | "en") => Promise<string | null>;

export function createGetPublicPopularPosts(dependencies: Pick<FanpageDependencies, "rpc" | "authorize">, options: { groupsEnabled: boolean; pageImage?: PageImage }) {
  return async (request: Request): Promise<Response> => {
    const query = new URL(request.url).searchParams;
    const locales = query.getAll("locale");
    const pages = query.getAll("page");
    const sorts = query.getAll("sort");
    const sort = z.enum(["likes", "comments", "views"]).safeParse(sorts[0] ?? "likes");
    const page = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(z.number().max(1000)).safeParse(pages[0] ?? "1");
    const locale = z.enum(["ko", "en"]).safeParse(locales[0] ?? "ko");
    if (locales.length > 1 || !locale.success || pages.length > 1 || !page.success || sorts.length > 1 || !sort.success) return json({ error: { code: "FAN_WEB_INVALID_INPUT" } }, 400);
    try {
      const authorization = request.headers.get("authorization");
      const owner = authorization === null ? null : (await dependencies.authorize(authorization)).appUserId;
      const data = popularPostsPageSchema.safeParse(await dependencies.rpc("read_public_popular_posts_sorted", { p_app_user_id: owner, p_locale: locale.data, p_page: page.data, p_include_groups: options.groupsEnabled, p_sort: sort.data }));
      if (!data.success) throw new Error("FAN_WEB_UNAVAILABLE");
      const { pageImage } = options;
      if (!pageImage) return json(data.data);
      // Each row carries its page's picture so the board can draw it; a page without one stays without the field.
      const pages = [...new Set(data.data.items.map((item) => `${item.source}:${item.pageRef}`))];
      const images = new Map(await Promise.all(pages.map(async (key) => {
        const [source, ...ref] = key.split(":");
        return [key, await pageImage(source as "fan" | "group", ref.join(":"), locale.data).catch(() => null)] as const;
      })));
      return json({ ...data.data, items: data.data.items.map((item) => { const url = images.get(`${item.source}:${item.pageRef}`); return url ? { ...item, pageImageUrl: url } : item; }) });
    } catch (error) {
      return feedFailure(error);
    }
  };
}
