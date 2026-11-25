import "server-only";
import { z } from "zod";
import { type PopularPost, popularPostsPageSchema } from "@/features/popular-board/domain/popular-posts";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { feedFailure } from "@/server/fan-posts/feed";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

const avatarsSchema = z.record(z.string(), publicAvatarUrlSchema);
const blockedKeysSchema = z.array(z.string());

type PageImage = (source: "fan" | "group", pageRef: string, locale: "ko" | "en") => Promise<string | null>;

type PublicPage = z.infer<typeof popularPostsPageSchema>;
export type PopularPostCache = Map<string, { expires: number; page: PublicPage }>;

const PAGE_SIZE = 10;
/** Signed-in readers get pages up to this one from the shared list; deeper pages read their own ranked list. */
const SHARED_PAGE_LIMIT = 5;
/** Shared pages read past the requested one to refill rows removed by blocks, before reading the reader's own list. */
const REFILL_PAGES = 2;

const postKey = (item: PopularPost) => `${item.source}:${item.id}`;
const postIds = (items: PopularPost[], source: "fan" | "group") => items.flatMap(item => item.source === source ? [item.id] : []);

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

    const readPage = async (owner: string | null, pageNo: number): Promise<PublicPage> => {
      const data = popularPostsPageSchema.safeParse(await dependencies.rpc("read_public_popular_posts_period", { p_app_user_id: owner, p_locale: locale.data, p_page: pageNo, p_include_groups: options.groupsEnabled, p_sort: sort.data, p_period: period.data }));
      if (!data.success) throw new Error("FAN_WEB_UNAVAILABLE");
      // RPC joins can repeat a post; preserve the first ranked row by its stable source and ID.
      const seen = new Set<string>();
      data.data.items = data.data.items.filter(item => { const key = postKey(item); if (seen.has(key)) return false; seen.add(key); return true; });
      // Each row carries its writer's picture. It is extra: when it cannot be read (the app is deployed before the function) the board still loads.
      const ids = (source: "fan" | "group") => postIds(data.data.items, source);
      const avatarsPending = !data.data.items.length ? {} : Promise.resolve(dependencies.rpc("public_post_author_avatars", { p_fan_post_ids: ids("fan"), p_group_post_ids: ids("group") }))
        .then(value => avatarsSchema.parse(value)).catch(() => ({} as Record<string, string>));
      const { pageImage } = options;
      const pageKeys = [...new Set(data.data.items.map((item) => `${item.source}:${item.pageRef}`))];
      const images = new Map(await Promise.all((pageImage ? pageKeys : []).map(async (key) => {
        const [source, ...ref] = key.split(":");
        return [key, await pageImage!(source as "fan" | "group", ref.join(":"), locale.data).catch(() => null)] as const;
      })));
      const avatars: Record<string, string> = await avatarsPending;
      return { ...data.data, items: data.data.items.map(item => {
        const avatarUrl = avatars[postKey(item)];
        const pageImageUrl = images.get(`${item.source}:${item.pageRef}`);
        return { ...item, ...(avatarUrl && { avatarUrl }), ...(pageImageUrl && { pageImageUrl }) };
      }) };
    };

    // The list everyone sees, kept 60 seconds per server process. It has no reader-specific rows.
    const sharedPage = async (pageNo: number): Promise<PublicPage> => {
      const cache = options.publicCache;
      const key = [options.groupsEnabled, locale.data, sort.data, period.data, pageNo].join(":");
      const hit = cache?.get(key);
      if (hit && hit.expires > Date.now()) return hit.page;
      const result = await readPage(null, pageNo);
      if (cache) {
        cache.delete(key);
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, { expires: Date.now() + 60_000, page: result });
      }
      return result;
    };

    // A signed-in reader's page is the shared list without posts of writers blocked either way, paged after removal.
    const readerPage = async (owner: string, pending: Promise<PublicPage[]>): Promise<PublicPage> => {
      const wanted = page.data * PAGE_SIZE;
      const items: PopularPost[] = [];
      const seen = new Set<string>();
      let hasMore = true;
      const take = async (list: PublicPage[]) => {
        const rows = list.flatMap(shared => shared.items);
        const blocked = new Set(!rows.length ? [] : blockedKeysSchema.parse(await dependencies.rpc("popular_post_blocked_keys", { p_app_user_id: owner, p_fan_post_ids: postIds(rows, "fan"), p_group_post_ids: postIds(rows, "group") })));
        for (const item of rows) {
          const key = postKey(item);
          if (seen.has(key) || blocked.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
        hasMore = list[list.length - 1].hasMore;
      };
      await take(await pending);
      for (let next = page.data + 1; items.length < wanted && hasMore && next <= page.data + REFILL_PAGES; next++) await take([await sharedPage(next)]);
      if (items.length < wanted && hasMore) return readPage(owner, page.data);
      // A full page with more shared rows left reports more, even when every remaining row turns out blocked.
      return { hasMore: items.length > wanted || hasMore, items: items.slice(wanted - PAGE_SIZE, wanted) };
    };

    try {
      const authorization = request.headers.get("authorization");
      if (authorization === null) return json(await sharedPage(page.data));
      const viewer = dependencies.authorize(authorization);
      if (page.data > SHARED_PAGE_LIMIT) return json(await readPage((await viewer).appUserId, page.data));
      // Read the shared pages while the sign-in is checked; nothing is answered before it passes.
      const pending = Promise.all(Array.from({ length: page.data }, (_, index) => sharedPage(index + 1)));
      pending.catch(() => undefined);
      const owner = (await viewer).appUserId;
      // Until the block read exists (the app is deployed before the function), answer from the reader's own ranked list.
      return json(await readerPage(owner, pending).catch(() => readPage(owner, page.data)));
    } catch (error) {
      return feedFailure(error);
    }
  };
}
