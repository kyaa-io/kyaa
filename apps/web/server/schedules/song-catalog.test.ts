import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSpotifySongCatalog, songQuerySchema } from "./song-catalog";
const id = "0123456789ABCDEFGHIJKL";
const track = { id, name: "밤편지", artists: [{ name: "아이유" }], album: { name: "Palette", images: [{ url: `https://i.scdn.co/image/${"a".repeat(40)}`, width: 300 }] } };
const credentials = { clientId: "test-client", clientSecret: "test-secret" };
const token = () => Response.json({ access_token: "private-token", expires_in: 3600 });
const results = () => Response.json({ tracks: { items: [track] } });

it("keeps credentials on fixed server endpoints and preserves original Korean metadata", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(results()).mockResolvedValueOnce(results());
  const search = createSpotifySongCatalog({ ...credentials, fetcher });
  expect(await search(" 아이유 밤편지 ")).toEqual([{ provider: "spotify", trackId: id, title: "밤편지", artist: "아이유", album: "Palette", artworkUrl: track.album.images[0].url, sourceUrl: `https://open.spotify.com/track/${id}` }]);
  await search("DAY6");
  expect(fetcher).toHaveBeenCalledTimes(3);
  const [url, init] = fetcher.mock.calls[1];
  expect(String(url)).toContain("https://api.spotify.com/v1/search?");
  expect(new URL(String(url)).searchParams.get("q")).toBe("아이유 밤편지");
  expect(new URL(String(url)).searchParams.get("market")).toBe("KR");
  expect(init).toMatchObject({ redirect: "error", cache: "no-store", headers: { authorization: "Bearer private-token" } });
  expect(fetcher.mock.calls[0][1]?.body).toBe("grant_type=client_credentials");
});
it("shares token refreshes, refreshes expiry and retries a refused token only once", async () => {
  let time = 0;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => String(input).endsWith("/token") ? token() : results());
  const search = createSpotifySongCatalog({ ...credentials, fetcher, now: () => time });
  await Promise.all([search("IU"), search("DAY6")]);
  expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith("/token"))).toHaveLength(1);
  time = 3_600_000;
  await search("IU");
  expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith("/token"))).toHaveLength(2);
  const refused = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(createSpotifySongCatalog({ ...credentials, fetcher: refused })("IU")).rejects.toMatchObject({ status: 503 });
  expect(refused).toHaveBeenCalledTimes(4);
});
it("returns an empty result honestly and drops malformed or unsafe artwork entries", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ tracks: { items: [null, { ...track, album: { ...track.album, images: [{ url: "https://evil.example/pixel", width: 300 }] } }] } }));
  expect(await createSpotifySongCatalog({ ...credentials, fetcher })("IU")).toEqual([]);
});
it("rejects invalid search before network and missing credentials without exposing details", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const search = createSpotifySongCatalog({ clientId: "", clientSecret: "", fetcher });
  expect(songQuerySchema.safeParse("a").success).toBe(false);
  expect(songQuerySchema.safeParse("a".repeat(121)).success).toBe(false);
  expect(songQuerySchema.safeParse("IU\u0001music").success).toBe(false);
  await expect(search("IU")).rejects.toMatchObject({ message: "SONG_SEARCH_UNAVAILABLE", status: 503 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds provider responses and maps timeout or quota failure to a safe fallback", async () => {
  for (const response of [new Response("x".repeat(256 * 1024 + 1)), Response.json({ unexpected: true })]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(response);
    await expect(createSpotifySongCatalog({ ...credentials, fetcher })("IU")).rejects.toMatchObject({ status: 503 });
  }
  const limited = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("provider details", { status: 429, headers: { "retry-after": "120" } }));
  await expect(createSpotifySongCatalog({ ...credentials, fetcher: limited })("IU")).rejects.toMatchObject({ status: 429, retryAfter: "120", message: "SONG_SEARCH_UNAVAILABLE" });
  const timeout = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("test-secret", "TimeoutError"));
  await expect(createSpotifySongCatalog({ ...credentials, fetcher: timeout })("IU")).rejects.toMatchObject({ status: 503, message: "SONG_SEARCH_UNAVAILABLE" });
});
