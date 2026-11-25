import "server-only";
import { z } from "zod";
import { popularPostsPageSchema } from "@/features/popular-board/domain/popular-posts";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { feedFailure } from "@/server/fan-posts/feed";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

const avatarsSchema = z.record(z.string(), publicAvatarUrlSchema);

type PageImage = (source: "fan" | "group", pageRef: string, locale: "ko" | "en") => Promise<string | null>;

type PublicPage = z.infer<typeof popularPostsPageSchema>;
export type PopularPostCache = Map<string, { expires: number; page: PublicPage }>;

export function createGetPublicPopularPosts(dependencies: Pick<FanpageDependencies, "rpc" | "authorize">, options: { groupsEnabled: boolean; pageImage?: PageImage; publicCache?: PopularPostCache }) {
  return async (request: Request): Promise<Response> => {
    const query = new URL(request.url).searchParams;
    const locales = query.getAll("locale");
    const pages = query.getAll("page");
    const sorts = query.getAll("sort");
    const periods = query.getAll("period");
    const period = z.enum(["today", "week", "month"]).safeParse(periods[0] ?? "week");
    const sort = z.enum(["likes", "comments", "views", "latest"]).safeParse(sorts[0] ?? "likes");
    const page = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(z.number().max(1000)).safeParse(pages[0] ?? "1");
    const locale = z.enum(["ko", "en"]).safeParse(locales[0] ?? "ko");
    if (locales.length > 1 || !locale.success || pages.length > 1 || !page.success || sorts.length > 1 || !sort.success || periods.length > 1 || !period.success) return json({ error: { code: "FAN_WEB_INVALID_INPUT" } }, 400);
    try {
      const authorization = request.headers.get("authorization");
      const owner = authorization === null ? null : (await dependencies.authorize(authorization)).appUserId;
      const cache = authorization === null ? options.publicCache : undefined;
      const key = [options.groupsEnabled, locale.data, sort.data, period.data, page.data].join(":");
      const hit = cache?.get(key);
      if (hit && hit.expires > Date.now()) return json(hit.page);
      const data = popularPostsPageSchema.safeParse(await dependencies.rpc("read_public_popular_posts_period", { p_app_user_id: owner, p_locale: locale.data, p_page: page.data, p_include_groups: options.groupsEnabled, p_sort: sort.data, p_period: period.data }));
      if (!data.success) throw new Error("FAN_WEB_UNAVAILABLE");
      // RPC joins can repeat a post; preserve the first ranked row by its stable source and ID.
      const seen = new Set<string>();
      data.data.items = data.data.items.filter(item => { const key = `${item.source}:${item.id}`; if (seen.has(key)) return false; seen.add(key); return true; });
      // Each row carries its writer's picture. It is extra: when it cannot be read (the app is deployed before the function) the board still loads.
      const ids = (source: "fan" | "group") => data.data.items.flatMap(item => item.source === source ? [item.id] : []);
      const avatarsPending = !data.data.items.length ? {} : Promise.resolve(dependencies.rpc("public_post_author_avatars", { p_fan_post_ids: ids("fan"), p_group_post_ids: ids("group") }))
        .then(value => avatarsSchema.parse(value)).catch(() => ({} as Record<string, string>));
      const { pageImage } = options;
      const pages = [...new Set(data.data.items.map((item) => `${item.source}:${item.pageRef}`))];
      const images = new Map(await Promise.all((pageImage ? pages : []).map(async (key) => {
        const [source, ...ref] = key.split(":");
        return [key, await pageImage!(source as "fan" | "group", ref.join(":"), locale.data).catch(() => null)] as const;
      })));
      const avatars = await avatarsPending;
      const result = { ...data.data, items: data.data.items.map(item => {
        const avatarUrl = avatars[`${item.source}:${item.id}`];
        const pageImageUrl = images.get(`${item.source}:${item.pageRef}`);
        return { ...item, ...(avatarUrl && { avatarUrl }), ...(pageImageUrl && { pageImageUrl }) };
      }) };
      if (cache) {
        cache.delete(key);
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: Date.now() + 60_000, page: result });
      }
      return json(result);
    } catch (error) {
      return feedFailure(error);
    }
  };
}
