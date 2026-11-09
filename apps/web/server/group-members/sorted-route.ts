import "server-only";
import { z } from "zod";
import { APP_LOCALES } from "@/i18n/locales";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { openFanCursor, sealFanCursor } from "./sorted-cursor";
import { sortedFanModeSchema, sortedFansRpcSchema } from "./sorted-domain";

/** Called only by the explicit sort=hearts version of public-people. Legacy DTOs stay unchanged. */
export async function readSortedFans(deps: FanpageDependencies, request: Request, pageId: string, secret: () => string | undefined) {
  const query = new URL(request.url).searchParams;
  for (const name of query.keys()) if (!["sort", "mode", "search", "cursor", "limit", "locale"].includes(name) || query.getAll(name).length !== 1) throw new SyntaxError("Invalid query");
  if (query.get("sort") !== "hearts") throw new SyntaxError("Invalid sort");
  const page = z.uuid().parse(pageId), mode = sortedFanModeSchema.parse(query.get("mode") ?? "members");
  const search = z.string().trim().max(100).parse(query.get("search") ?? "");
  const locale = z.enum(APP_LOCALES).parse(query.get("locale") ?? "ko");
  const limit = z.coerce.number().int().min(1).max(30).parse(query.get("limit") ?? 30);
  const auth = request.headers.get("authorization");
  const actor = auth === null ? null : (await deps.authorize(auth)).appUserId;
  if (mode === "friends" && actor === null) return Response.json({ error: { code: "AUTHENTICATION_REQUIRED" } }, { status: 401, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
  const scope = { actor, page, mode, search, locale };
  const cursor = query.has("cursor") ? openFanCursor(query.get("cursor")!, scope, secret()) : null;
  const raw = await deps.rpc("read_group_fans", { p_actor: actor, p_page_id: page, p_mode: mode, p_search: search, p_cursor: cursor, p_limit: limit, p_locale: locale === "ko" ? "ko" : "en" });
  const parsed = sortedFansRpcSchema.safeParse(raw);
  if (!parsed.success) throw new Error("GROUPS_UNAVAILABLE");
  const items = parsed.data.items.map(({ nickname, avatarUrl, tier, hearts, stamps, first_jjinfan_at }) => ({ nickname, avatarUrl, tier, hearts, stamps, first_jjinfan_at }));
  return Response.json({ items, nextCursor: parsed.data.nextCursor ? sealFanCursor(parsed.data.nextCursor, scope, secret()) : null }, { headers: { "cache-control": "private, no-store", vary: "Authorization" } });
}
