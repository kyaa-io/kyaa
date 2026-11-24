// Collect one daily sample for an official YouTube channel and a curated Naver query.
// Persist the returned source items verbatim alongside the derived metrics.
export async function collectCreatorHex({ channelId, newsQuery, now = new Date(), env = process.env, fetcher = fetch }) {
  if (!/^UC[\w-]{22}$/.test(channelId) || !newsQuery?.trim()) throw new Error("Missing official channel or news query");
  if (!env.YOUTUBE_DATA_API_KEY || !env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) throw new Error("Missing collector credentials");

  async function get(endpoint, params, headers) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams(params);
    const response = await fetcher(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Collection failed with HTTP " + response.status);
    const page = await response.json();
    if (!Array.isArray(page.items)) throw new Error("Missing API result list");
    return page.items;
  }
  const youtube = (path, params) => get("https://www.googleapis.com/youtube/v3/" + path, params, { "X-Goog-Api-Key": env.YOUTUBE_DATA_API_KEY });
  const [channel] = await youtube("channels", { part: "contentDetails,statistics", id: channelId });
  if (channel?.id !== channelId) throw new Error("Official channel unavailable");
  const videos = [];
  const playlistId = channel.contentDetails.relatedPlaylists.uploads;
  const uploads = await youtube("playlistItems", { part: "contentDetails", playlistId, maxResults: "50" });
  if (uploads.length) {
    const ids = uploads.map(item => item.contentDetails.videoId);
    const items = await youtube("videos", { part: "snippet,status,statistics", id: ids.join(",") });
    for (const id of ids) {
      const video = items.find(item => item.id === id);
      if (video?.snippet.channelId === channelId && video.status.privacyStatus === "public") videos.push(video);
      if (videos.length === 10) break;
    }
  }
  const articles = new Map();
  const cutoff = now.getTime() - 30 * 86400000;
  for (let start = 1; start <= 901; start += 100) {
    const page = await get("https://openapi.naver.com/v1/search/news.json", { query: newsQuery, sort: "date", start, display: 100 }, {
      "X-Naver-Client-Id": env.NAVER_CLIENT_ID, "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
    });
    let reachedCutoff = false;
    for (const item of page) {
      const date = Date.parse(item.pubDate);
      const link = item.originallink || item.link;
      if (!Number.isFinite(date) || !link) throw new Error("Invalid news item");
      if (date < cutoff) reachedCutoff = true;
      else if (date <= now.getTime()) articles.set(link, item);
    }
    if (reachedCutoff || page.length < 100) break;
    if (start === 901) throw new Error("News search limit reached before cutoff");
  }
  const total = videos.reduce((sum, video) => sum + ["likeCount", "viewCount", "commentCount"].reduce((n, key) => n + Number(video.statistics[key] ?? 0), 0), 0);
  return { collectedAt: now.toISOString(), reactions: videos.length ? total / videos.length : 0,
    news: articles.size, sources: { channel, videos, articles: [...articles.values()] } };
}
