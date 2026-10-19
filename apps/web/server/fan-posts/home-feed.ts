import "server-only";
import { z } from "zod";
import { publicHomeFeedSchema } from "@/features/fan-posts/domain/home-feed";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { feedFailure } from "./feed";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

export function createGetPublicHomeFeed(dependencies: Pick<FanpageDependencies, "rpc" | "authorize">) {
  return async (request: Request): Promise<Response> => {
    const locales = new URL(request.url).searchParams.getAll("locale");
    const locale = z.enum(["ko", "en"]).safeParse(locales[0] ?? "ko");
    if (locales.length > 1 || !locale.success) return json({ error: { code: "FAN_WEB_INVALID_INPUT" } }, 400);
    try {
      const authorization = request.headers.get("authorization");
      const owner = authorization === null ? null : (await dependencies.authorize(authorization)).appUserId;
      const data = publicHomeFeedSchema.safeParse(await dependencies.rpc("read_public_home_feed", { p_app_user_id: owner, p_locale: locale.data }));
      if (!data.success) throw new Error("FAN_WEB_UNAVAILABLE");
      return json(data.data);
    } catch (error) {
      return feedFailure(error);
    }
  };
}
