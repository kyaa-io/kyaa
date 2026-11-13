// Deterministic SNS collection core. No LLM, no rewriting: it copies original fields from the
// platform's own page data and sends them to POST /api/internal/sns-ingest, which builds the post.
// Browser access lives in collect.aside.mjs; everything here is pure and unit tested.

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const MAX_POSTS_PER_SOURCE = 30;

export function accountHandle(platform, accountUrl) {
  const url = new URL(accountUrl);
  const match = platform === "tiktok" ? /^\/@([A-Za-z0-9._]{1,30})\/?$/.exec(url.pathname) : /^\/([A-Za-z0-9._]{1,30})\/?$/.exec(url.pathname);
  if (!match) throw new Error("ACCOUNT_URL_INVALID");
  return match[1];
}

export function canonicalPostUrl(platform, handle, sourceId) {
  if (!HANDLE.test(handle)) throw new Error("HANDLE_INVALID");
  return platform === "tiktok"
    ? `https://www.tiktok.com/@${handle}/video/${sourceId}`
    : `https://www.instagram.com/${handle}/p/${sourceId}/`;
}

/** Post links found on the profile page, newest first as the page lists them, de-duplicated. */
export function profilePostIds(platform, hrefs, handle) {
  const ids = [];
  for (const href of hrefs) {
    let url;
    try { url = new URL(href, platform === "tiktok" ? "https://www.tiktok.com" : "https://www.instagram.com"); } catch { continue; }
    const match = platform === "tiktok"
      ? /^\/@([A-Za-z0-9._]{1,30})\/(?:video|photo)\/([0-9]{5,32})\/?$/.exec(url.pathname)
      : /^\/(?:([A-Za-z0-9._]{1,30})\/)?(?:p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/.exec(url.pathname);
    if (!match) continue;
    // A pinned or tagged post from another account is not this source's post.
    if (match[1] && match[1].toLowerCase() !== handle.toLowerCase()) continue;
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids.slice(0, MAX_POSTS_PER_SOURCE);
}

export function isLoginWall(platform, finalUrl) {
  const url = new URL(finalUrl);
  return platform === "tiktok" ? url.pathname.startsWith("/login") : url.pathname.startsWith("/accounts/login") || url.pathname.startsWith("/challenge");
}

function findKey(value, key, depth = 0) {
  if (!value || typeof value !== "object" || depth > 40) return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

const bestImage = candidates => Array.isArray(candidates) && typeof candidates[0]?.url === "string" ? candidates[0].url : null;

/**
 * Instagram post page: the media item embedded in the page's JSON scripts
 * (`xdt_api__v1__media__shortcode__web_info.items[0]`). The meta description is never used,
 * because it wraps the caption with like counts, the account name and the date.
 */
export function extractInstagramPost(scriptTexts, expected) {
  let item;
  for (const text of scriptTexts) {
    if (!text.includes("xdt_api__v1__media__shortcode__web_info")) continue;
    item = findKey(parseJson(text), "xdt_api__v1__media__shortcode__web_info")?.items?.[0];
    if (item) break;
  }
  if (!item) return { error: "STRUCTURE_CHANGED" };
  if (item.code !== expected.sourceId) return { error: "SOURCE_MISMATCH" };
  if (String(item.user?.username ?? "").toLowerCase() !== expected.handle.toLowerCase()) return { error: "OTHER_ACCOUNT" };
  if (!Number.isInteger(item.taken_at)) return { error: "STRUCTURE_CHANGED" };
  const media = Array.isArray(item.carousel_media) && item.carousel_media.length ? item.carousel_media : [item];
  const images = media.map(entry => bestImage(entry.image_versions2?.candidates)).filter(Boolean).slice(0, 2).map(url => ({ url }));
  return { post: {
    sourceId: item.code,
    sourceUrl: canonicalPostUrl("instagram", expected.handle, item.code),
    sourcePublishedAt: new Date(item.taken_at * 1000).toISOString(),
    text: typeof item.caption?.text === "string" ? item.caption.text : "",
    images: item.media_type === 2 ? [] : images,
    ...(item.media_type === 2 && images[0] ? { videoThumbnail: images[0] } : {}),
  } };
}

/** TikTok post page: `__UNIVERSAL_DATA_FOR_REHYDRATION__` → `webapp.video-detail.itemInfo.itemStruct`. */
export function extractTikTokPost(rehydrationText, expected) {
  const data = parseJson(rehydrationText ?? "");
  const item = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (!item) return { error: "STRUCTURE_CHANGED" };
  if (String(item.id) !== expected.sourceId) return { error: "SOURCE_MISMATCH" };
  if (String(item.author?.uniqueId ?? "").toLowerCase() !== expected.handle.toLowerCase()) return { error: "OTHER_ACCOUNT" };
  const created = Number(item.createTime);
  if (!Number.isInteger(created) || created <= 0) return { error: "STRUCTURE_CHANGED" };
  const photos = item.imagePost?.images?.map(image => image.imageURL?.urlList?.[0]).filter(url => typeof url === "string") ?? [];
  const cover = typeof item.video?.cover === "string" && item.video.cover ? [item.video.cover] : [];
  return { post: {
    sourceId: String(item.id),
    sourceUrl: canonicalPostUrl("tiktok", expected.handle, String(item.id)),
    sourcePublishedAt: new Date(created * 1000).toISOString(),
    text: typeof item.desc === "string" ? item.desc : "",
    images: photos.slice(0, 2).map(url => ({ url })),
    ...(cover.length && !photos.length ? { videoThumbnail: { url: cover[0] } } : {}),
  } };
}

export function buildIngestRequest(source, posts, collectorError) {
  return collectorError
    ? { celebritySlug: source.celebritySlug, platform: source.platform, collectorError, posts: [] }
    : { celebritySlug: source.celebritySlug, platform: source.platform, posts };
}

export async function sendIngest(fetchImpl, endpoint, secret, body) {
  if (!secret || secret.length < 32) throw new Error("SNS_INGEST_SECRET_MISSING");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("SNS_INGEST_ENDPOINT_INVALID");
  const response = await fetchImpl(url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(280_000),
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`SNS_INGEST_HTTP_${response.status}${result?.error?.code ? `_${result.error.code}` : ""}`);
  return result;
}

/**
 * One source: list post ids on the profile, read each post page, send originals.
 * `browser.read(url)` returns `{ finalUrl, hrefs, scripts, rehydration }` from a dedicated tab.
 * Posts whose page cannot be read are left out and counted; the server decides everything else.
 */
export async function collectSource(browser, source, options = {}) {
  const handle = accountHandle(source.platform, source.accountUrl);
  const profile = await browser.read(source.accountUrl);
  if (isLoginWall(source.platform, profile.finalUrl)) return { request: buildIngestRequest(source, [], "BLOCKED_LOGIN"), unread: [] };
  const ids = profilePostIds(source.platform, profile.hrefs, handle).slice(0, options.limit ?? MAX_POSTS_PER_SOURCE);
  if (!ids.length) return { request: buildIngestRequest(source, [], "STRUCTURE_CHANGED"), unread: [] };
  const posts = []; const unread = [];
  for (const sourceId of ids) {
    let page;
    try { page = await browser.read(canonicalPostUrl(source.platform, handle, sourceId)); }
    catch { unread.push({ sourceId, error: "READ_FAILED" }); continue; }
    if (isLoginWall(source.platform, page.finalUrl)) return { request: buildIngestRequest(source, [], "BLOCKED_LOGIN"), unread: [] };
    const result = source.platform === "tiktok"
      ? extractTikTokPost(page.rehydration, { handle, sourceId })
      : extractInstagramPost(page.scripts, { handle, sourceId });
    if (result.post) posts.push(result.post); else unread.push({ sourceId, error: result.error });
  }
  // Every listed post failing to parse means the page layout changed, not that there is nothing new.
  if (!posts.length) return { request: buildIngestRequest(source, [], "STRUCTURE_CHANGED"), unread };
  return { request: buildIngestRequest(source, posts), unread };
}
