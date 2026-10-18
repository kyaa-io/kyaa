import "server-only";
import { z } from "zod";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { creatorSlug } from "../../features/schedules/domain/participation";
import { songSearchResponseSchema, type SongSelection } from "../../features/live-submissions/domain/song";
import { FanAuthUnavailableError } from "../fan-auth/fan-auth-gate";
import { createFanpageDependencies } from "../fanpage/dependencies";
import type { FanpageDependencies } from "../fanpage/routes";
import { searchSpotifySongs, songQuerySchema, SongCatalogError } from "./song-catalog";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
type Dependencies = Pick<FanpageDependencies, "authorize" | "rpc"> & { search: (query: string) => Promise<SongSelection[]> };
export function createSongSearchHandler(deps: Dependencies) {
  return async (request: Request) => {
    try {
      const user = await deps.authorize(request.headers.get("authorization"));
      const url = new URL(request.url), query = songQuerySchema.parse(url.searchParams.get("q"));
      const slug = creatorSlug.parse(url.searchParams.get("slug"));
      await deps.rpc("fan_web_authorize_song_search", { p_app_user_id: user.appUserId, p_live_slug: slug });
      const result = songSearchResponseSchema.safeParse({ items: await deps.search(query) });
      if (!result.success) throw new SongCatalogError();
      return Response.json(result.data, { headers });
    } catch (error) {
      if (error instanceof AuthError || error instanceof FanAuthUnavailableError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
      if (error instanceof z.ZodError) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 422, headers });
      const code = error instanceof Error ? error.message.match(/FAN_WEB_(?:NOT_FOUND|CLOSED|MEMBERS_REQUIRED|ACTIVE_ACCOUNT_REQUIRED|RATE_LIMIT)\b/)?.[0] : undefined;
      const status = error instanceof SongCatalogError ? error.status : code?.endsWith("NOT_FOUND") ? 404 : code?.endsWith("CLOSED") ? 409 : code?.endsWith("REQUIRED") ? 403 : code?.endsWith("RATE_LIMIT") ? 429 : 503;
      return Response.json({ error: { code: code ?? "SONG_SEARCH_UNAVAILABLE" } }, { status,
        headers: { ...headers, ...(error instanceof SongCatalogError && error.retryAfter ? { "retry-after": error.retryAfter } : {}) } });
    }
  };
}
export async function songSearchRoute(request: Request) {
  try { return await createSongSearchHandler({ ...createFanpageDependencies(), search: searchSpotifySongs })(request); }
  catch { return Response.json({ error: { code: "SONG_SEARCH_UNAVAILABLE" } }, { status: 503, headers }); }
}
