import "server-only";
import { z } from "zod";
import { songSelectionSchema, type SongSelection } from "../../features/live-submissions/domain/song";

export const songQuerySchema = z.string().trim().min(2).max(120).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export class SongCatalogError extends Error {
  constructor(readonly status = 503, readonly retryAfter?: string) { super("SONG_SEARCH_UNAVAILABLE"); }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const seconds = Number(response.headers.get("retry-after"));
    await response.body?.cancel();
    throw new SongCatalogError(response.status === 429 ? 429 : 503,
      response.status === 429 ? String(Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 600) : 60) : undefined);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SongCatalogError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 256 * 1024) { await reader.cancel(); throw new SongCatalogError(); }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

const trackSchema = z.object({
  id: z.string(), name: z.string(), artists: z.array(z.object({ name: z.string() })),
  album: z.object({ name: z.string(), images: z.array(z.object({ url: z.string(), width: z.number().nullable().optional() })) }),
});

export function createSpotifySongCatalog({
  clientId = process.env.SPOTIFY_CLIENT_ID,
  clientSecret = process.env.SPOTIFY_CLIENT_SECRET,
  fetcher = fetch,
  now = Date.now,
}: { clientId?: string; clientSecret?: string; fetcher?: typeof fetch; now?: () => number } = {}) {
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;
  async function accessToken() {
    if (!clientId || !clientSecret) throw new SongCatalogError();
    if (token && token.expiresAt > now()) return token.value;
    if (!pendingToken) pendingToken = (async () => {
      const response = await fetcher("https://accounts.spotify.com/api/token", {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
        headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const result = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive() }).parse(await readJson(response));
      token = { value: result.access_token, expiresAt: now() + Math.max(0, result.expires_in - 60) * 1000 };
      return token.value;
    })().finally(() => { pendingToken = undefined; });
    return pendingToken;
  }
  return async (query: string): Promise<SongSelection[]> => {
    const term = songQuerySchema.parse(query);
    try {
      const url = new URL("https://api.spotify.com/v1/search");
      url.search = new URLSearchParams({ q: term, type: "track", market: "KR", limit: "10" }).toString();
      const request = async () => {
        const value = await accessToken();
        return fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000), headers: { authorization: `Bearer ${value}` } });
      };
      let response = await request();
      if (response.status === 401) { await response.body?.cancel(); token = undefined; response = await request(); }
      const result = z.object({ tracks: z.object({ items: z.array(z.unknown()) }) }).parse(await readJson(response));
      return result.tracks.items.slice(0, 10).flatMap(item => {
        const parsed = trackSchema.safeParse(item);
        if (!parsed.success) return [];
        const track = parsed.data;
        const artwork = track.album.images.find(image => image.width && image.width >= 128 && image.width <= 400) ?? track.album.images[0];
        const song = songSelectionSchema.safeParse({ provider: "spotify", trackId: track.id, title: track.name,
          artist: track.artists.map(artist => artist.name).join(", "), album: track.album.name || null,
          artworkUrl: artwork?.url ?? null, sourceUrl: `https://open.spotify.com/track/${track.id}` });
        return song.success ? [song.data] : [];
      });
    } catch (error) { throw error instanceof SongCatalogError ? error : new SongCatalogError(); }
  };
}

export const searchSpotifySongs = createSpotifySongCatalog();
