import { beforeEach, expect, it, vi } from "vitest";
import { pickEmbeddableUpload, readOfficialEmbedVideoId, resetOfficialEmbedCache, youtubeDurationSeconds, readYouTubeUploads } from "./youtube-uploads";
vi.mock("server-only", () => ({}));
const channel = `UC${"a".repeat(22)}`, playlist = `UU${"a".repeat(22)}`;
const video = (id: string, privacyStatus = "public", liveBroadcastContent = "none", channelId = channel) => ({ id, snippet: { channelId, title: `Video ${id}`, publishedAt: "2026-09-27T00:00:00Z", liveBroadcastContent }, status: { privacyStatus } });
function api(videos: Array<ReturnType<typeof video> & { liveStreamingDetails?: Record<string, string> }> = [video("abcdefghijk")]) {
  return vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [{ id: channel, contentDetails: { relatedPlaylists: { uploads: playlist } } }] }))
    .mockResolvedValueOnce(Response.json({ items: videos.map(item => ({ contentDetails: { videoId: item.id } })) }))
    .mockResolvedValueOnce(Response.json({ items: videos }));
}
it("resolves the published channel identity and returns only its public recorded uploads", async () => {
  const fetcher = api([video("abcdefghijk"), video("private____", "private"), video("live_______", "public", "live"), video("other______", "public", "none", `UC${"b".repeat(22)}`), { ...video("ended______"), liveStreamingDetails: { actualStartTime: "2026-09-01T00:00:00Z", actualEndTime: "2026-09-01T01:00:00Z" } }]);
  const items = await readYouTubeUploads("https://www.youtube.com/@ElinaKarimova", { apiKey: "key", fetcher });
  expect(items).toEqual([expect.objectContaining({ href: "https://www.youtube.com/watch?v=abcdefghijk", image: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", kind: "videos" })]);
  const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
  expect(urls.map(url => url.pathname)).toEqual(["/youtube/v3/channels", "/youtube/v3/playlistItems", "/youtube/v3/videos"]);
  expect(urls[0].searchParams.get("forHandle")).toBe("elinakarimova");
  expect(urls[1].searchParams.get("playlistId")).toBe(playlist);
});
it("rejects arbitrary hosts without sending a key and distinguishes quota failure from no uploads", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 403 } }, { status: 403 }));
  expect(await readYouTubeUploads("https://attacker.invalid/@artist", { apiKey: "key", fetcher })).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await readYouTubeUploads(`https://youtube.com/channel/${channel}`, { apiKey: "key", fetcher })).toBeNull();
  const empty = api([]);
  expect(await readYouTubeUploads(`https://youtube.com/channel/${channel}`, { apiKey: "key", fetcher: empty })).toEqual([]);
  expect(empty).toHaveBeenCalledTimes(2);
});
it("does not accept mismatched explicit channels or malformed upstream video data", async () => {
  const wrong = api();
  expect(await readYouTubeUploads(`https://youtube.com/channel/UC${"b".repeat(22)}`, { apiKey: "key", fetcher: wrong })).toBeNull();
  expect(wrong).toHaveBeenCalledTimes(1);
  const malformed = api([{ ...video("abcdefghijk"), snippet: { ...video("abcdefghijk").snippet, publishedAt: "not-a-date" } }]);
  expect(await readYouTubeUploads(`https://youtube.com/channel/${channel}`, { apiKey: "key", fetcher: malformed })).toBeNull();
});

// Fixtures follow the real channels.list / playlistItems.list / videos.list shapes (part=snippet,status,contentDetails).
const entry = (id: string, duration: string, opts: { embeddable?: boolean; privacyStatus?: string; liveBroadcastContent?: string; channelId?: string; publishedAt?: string } = {}) => ({
  id, snippet: { channelId: opts.channelId ?? channel, publishedAt: opts.publishedAt ?? "2026-11-01T00:00:00Z", liveBroadcastContent: opts.liveBroadcastContent ?? "none" },
  status: { privacyStatus: opts.privacyStatus ?? "public", embeddable: opts.embeddable ?? true }, contentDetails: { duration },
});
function embedApi(videos: ReturnType<typeof entry>[]) {
  return vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [{ id: channel, contentDetails: { relatedPlaylists: { uploads: playlist } } }] }))
    .mockResolvedValueOnce(Response.json({ items: videos.map(item => ({ contentDetails: { videoId: item.id } })) }))
    .mockResolvedValueOnce(Response.json({ items: videos }));
}
const channelUrl = `https://www.youtube.com/channel/${channel}`;
beforeEach(() => resetOfficialEmbedCache());

it("reads ISO 8601 durations", () => {
  expect([youtubeDurationSeconds("PT59S"), youtubeDurationSeconds("PT1M"), youtubeDurationSeconds("PT1H2M3S"), youtubeDurationSeconds("P0D"), youtubeDurationSeconds("nonsense")]).toEqual([59, 60, 3723, 0, 0]);
});
it("skips Shorts-length uploads and takes the newest playable video, with one batched videos call", async () => {
  const fetcher = embedApi([
    entry("short000001", "PT45S", { publishedAt: "2026-11-08T00:00:00Z" }),
    entry("noembed0001", "PT10M", { embeddable: false, publishedAt: "2026-11-07T00:00:00Z" }),
    entry("good0000001", "PT3M20S", { publishedAt: "2026-11-05T00:00:00Z" }),
    entry("older000001", "PT8M", { publishedAt: "2026-10-01T00:00:00Z" }),
  ]);
  expect(await pickEmbeddableUpload(channelUrl, { apiKey: "key", fetcher })).toEqual({ videoId: "good0000001" });
  const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
  expect(urls.map(url => url.pathname)).toEqual(["/youtube/v3/channels", "/youtube/v3/playlistItems", "/youtube/v3/videos"]);
  expect(urls[2].searchParams.get("id")!.split(",")).toHaveLength(4);
  expect(urls[2].searchParams.get("part")).toBe("snippet,status,contentDetails");
});
it("returns no video when every candidate is Shorts, not embeddable, private, live, or from another channel", async () => {
  const fetcher = embedApi([
    entry("short000001", "PT59S"), entry("noembed0001", "PT5M", { embeddable: false }), entry("private0001", "PT5M", { privacyStatus: "private" }),
    entry("live0000001", "P0D", { liveBroadcastContent: "live" }), entry("upcoming001", "P0D", { liveBroadcastContent: "upcoming" }), entry("other000001", "PT5M", { channelId: `UC${"b".repeat(22)}` }),
  ]);
  expect(await pickEmbeddableUpload(channelUrl, { apiKey: "key", fetcher })).toEqual({ videoId: null });
});
it("accepts exactly 60 seconds and reports an empty channel as no video", async () => {
  expect(await pickEmbeddableUpload(channelUrl, { apiKey: "key", fetcher: embedApi([entry("sixty000001", "PT1M")]) })).toEqual({ videoId: "sixty000001" });
  expect(await pickEmbeddableUpload(channelUrl, { apiKey: "key", fetcher: embedApi([]) })).toEqual({ videoId: null });
});
it("distinguishes an API failure (null) from no playable video", async () => {
  const quota = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 403 } }, { status: 403 }));
  expect(await pickEmbeddableUpload(channelUrl, { apiKey: "key", fetcher: quota })).toBeNull();
  expect(await pickEmbeddableUpload(channelUrl, { fetcher: quota, apiKey: "" })).toBeNull();
});
it("keeps the last good video when a later lookup fails, and shows none when there never was one", async () => {
  let clock = 0;
  const now = () => clock;
  const quota = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 403 } }, { status: 403 }));
  expect(await readOfficialEmbedVideoId(channelUrl, { apiKey: "key", fetcher: quota, now })).toBeNull();
  const good = embedApi([entry("good0000001", "PT5M")]);
  expect(await readOfficialEmbedVideoId(channelUrl, { apiKey: "key", fetcher: good, now })).toBe("good0000001");
  clock += 60_000;
  expect(await readOfficialEmbedVideoId(channelUrl, { apiKey: "key", fetcher: quota, now })).toBe("good0000001");
  expect(quota).toHaveBeenCalledTimes(1); // still fresh: no new upstream call
  clock += 16 * 60_000;
  expect(await readOfficialEmbedVideoId(channelUrl, { apiKey: "key", fetcher: quota, now })).toBe("good0000001");
  expect(quota).toHaveBeenCalledTimes(2);
  const newer = embedApi([entry("newer000001", "PT5M")]);
  expect(await readOfficialEmbedVideoId(channelUrl, { apiKey: "key", fetcher: newer, now })).toBe("newer000001");
});
it("picks the newest long video for NCHIVE, whose latest uploads are all Shorts (public values observed 2026-11-09)", async () => {
  const observed: Array<[string, string, number]> = [
    ["xdkFE0rJV8o", "2026-11-08T14:30:37Z", 9], ["yCKtRDlfyEo", "2026-11-07T15:13:40Z", 16], ["g2VIYLsOrMg", "2026-11-04T14:00:07Z", 30], ["AzPy-AYr1fs", "2026-11-04T08:29:10Z", 29],
    ["NpM4zlpB2I4", "2026-11-03T13:08:44Z", 12], ["UaVovJswf7E", "2026-11-02T15:37:09Z", 15], ["mGScvYVby-Q", "2026-10-31T19:01:13Z", 15], ["r8tq8JzSSHA", "2026-10-30T09:56:03Z", 14],
    ["9czEUxq0-FQ", "2026-10-27T09:08:58Z", 31], ["rV4SY3i_bp8", "2026-10-23T03:18:55Z", 16], ["9ZFCHQvxq2Q", "2026-10-20T10:27:10Z", 13], ["KdZJIKbDbHs", "2026-10-19T14:59:33Z", 1426],
    ["sau_DrPS7zU", "2026-10-19T09:40:18Z", 14], ["klgb6zgTquU", "2026-10-17T20:02:39Z", 15], ["A-Y8Xmslfeg", "2026-10-15T12:00:36Z", 15],
  ];
  const videos = observed.map(([id, publishedAt, seconds]) => entry(id, `PT${Math.floor(seconds / 60)}M${seconds % 60}S`, { publishedAt }));
  expect(await pickEmbeddableUpload(channelUrl, { apiKey: "key", fetcher: embedApi(videos) })).toEqual({ videoId: "KdZJIKbDbHs" });
});
