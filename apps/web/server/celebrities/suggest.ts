import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { APP_LOCALES } from "@/i18n/locales";

// Name dictionary sources: Wikidata (CC0) and MusicBrainz core artist data (CC0). See scripts/celebrity-names/README.md.
const headers = { "cache-control": "private, max-age=60", vary: "Authorization" };
const errorHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const query = z.string().trim().max(50).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const suggestions = z.object({ items: z.array(z.object({
  name: z.string(),
  secondaryName: z.string().nullable(),
  category: z.enum(["idol", "singer", "actor", "creator"]).nullable(),
  page: z.object({ slug: z.string() }).nullable(),
})) });
export const celebritySuggestUnavailable = () => Response.json({ error: { code: "CELEBRITY_SUGGEST_UNAVAILABLE" } }, { status: 503, headers: errorHeaders });

export function createCelebritySuggestHandler(deps: Pick<FanpageDependencies, "rpc" | "authorize">) {
  return async (request: Request) => {
    try {
      await deps.authorize(request.headers.get("authorization"));
      const url = new URL(request.url);
      const one = (key: string) => { const values = url.searchParams.getAll(key); if (values.length > 1) throw new SyntaxError("duplicate query"); return values[0]; };
      const text = query.parse(one("q") ?? "");
      const limit = z.coerce.number().int().min(1).max(20).parse(one("limit") ?? 8);
      const locale = z.enum(APP_LOCALES).parse(one("locale") ?? "ko");
      if (!text) return Response.json({ items: [] }, { headers });
      const read = suggestions.safeParse(await deps.rpc("celebrity_name_suggest", { p_query: text, p_limit: limit, p_locale: locale }));
      return read.success ? Response.json(read.data, { headers }) : celebritySuggestUnavailable();
    } catch (error) {
      if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers: errorHeaders });
      if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "CELEBRITY_SUGGEST_INVALID_REQUEST" } }, { status: 400, headers: errorHeaders });
      return celebritySuggestUnavailable();
    }
  };
}
