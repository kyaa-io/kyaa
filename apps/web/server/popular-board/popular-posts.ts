import "server-only";
import { z } from "zod";
import { popularPostsPageSchema } from "@/features/popular-board/domain/popular-posts";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { feedFailure } from "@/server/fan-posts/feed";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

export function createGetPublicPopularPosts(dependencies: Pick<FanpageDependencies, "rpc" | "authorize">, options: { groupsEnabled: boolean }) {
  return async (request: Request): Promise<Response> => {
    const query = new URL(request.url).searchParams;
    const locales = query.getAll("locale");
    const pages = query.getAll("page");
    const page = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(z.number().max(1000)).safeParse(pages[0] ?? "1");
    const locale = z.enum(["ko", "en"]).safeParse(locales[0] ?? "ko");
    if (locales.length > 1 || !locale.success || pages.length > 1 || !page.success) return json({ error: { code: "FAN_WEB_INVALID_INPUT" } }, 400);
    try {
      const authorization = request.headers.get("authorization");
      const owner = authorization === null ? null : (await dependencies.authorize(authorization)).appUserId;
      const data = popularPostsPageSchema.safeParse(await dependencies.rpc("read_public_popular_posts_page", { p_app_user_id: owner, p_locale: locale.data, p_page: page.data, p_include_groups: options.groupsEnabled }));
      if (!data.success) throw new Error("FAN_WEB_UNAVAILABLE");
      return json(data.data);
    } catch (error) {
      return feedFailure(error);
    }
  };
}
