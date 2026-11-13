import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountHandle, buildIngestRequest, canonicalPostUrl, collectSource, extractInstagramPost, extractTikTokPost,
  isLoginWall, profilePostIds, sendIngest,
} from "./collect-core.mjs";

const igSource = { celebritySlug: "wena", platform: "instagram", accountUrl: "https://www.instagram.com/wena/" };
const caption = "오늘 무대 고마워요 💜\n\n#wena #kyaa";
const igScript = (item) => JSON.stringify({ require: [["x", { data: { xdt_api__v1__media__shortcode__web_info: { items: [item] } } }]] });
const igItem = {
  code: "DQabc123xyz", taken_at: 1762740000, user: { username: "wena" }, caption: { text: caption },
  carousel_media: [1, 2, 3].map(index => ({ image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/${index}.jpg` }] } })),
};

test("account handle and canonical post URLs", () => {
  assert.equal(accountHandle("instagram", "https://www.instagram.com/wena/"), "wena");
  assert.equal(accountHandle("tiktok", "https://www.tiktok.com/@wena"), "wena");
  assert.throws(() => accountHandle("tiktok", "https://www.tiktok.com/wena"));
  assert.equal(canonicalPostUrl("instagram", "wena", "DQabc123xyz"), "https://www.instagram.com/wena/p/DQabc123xyz/");
  assert.equal(canonicalPostUrl("tiktok", "wena", "7561"), "https://www.tiktok.com/@wena/video/7561");
});

test("profile links keep this account's posts once, in page order", () => {
  assert.deepEqual(profilePostIds("instagram", ["/p/AAAAA1/", "/wena/reel/BBBBB2/", "/other/p/CCCCC3/", "/p/AAAAA1/", "/explore/", "https://www.instagram.com/wena/p/DDDDD4/?img_index=1"], "wena"),
    ["AAAAA1", "BBBBB2", "DDDDD4"]);
  assert.deepEqual(profilePostIds("tiktok", ["/@wena/video/75611111", "/@friend/video/75622222", "https://www.tiktok.com/@wena/photo/75633333"], "wena"), ["75611111", "75633333"]);
});

test("login walls are detected from the final URL", () => {
  assert.equal(isLoginWall("instagram", "https://www.instagram.com/accounts/login/?next=%2Fwena%2F"), true);
  assert.equal(isLoginWall("instagram", "https://www.instagram.com/wena/"), false);
  assert.equal(isLoginWall("tiktok", "https://www.tiktok.com/login?redirect_url=x"), true);
});

test("Instagram caption is copied byte for byte from the media item, never the meta description", () => {
  const { post } = extractInstagramPost(["{}", igScript(igItem)], { handle: "wena", sourceId: "DQabc123xyz" });
  assert.deepEqual(post, {
    sourceId: "DQabc123xyz", sourceUrl: "https://www.instagram.com/wena/p/DQabc123xyz/", sourcePublishedAt: "2025-11-10T02:00:00.000Z",
    text: caption, images: [{ url: "https://scontent.cdninstagram.com/1.jpg" }, { url: "https://scontent.cdninstagram.com/2.jpg" }],
  });
  assert.equal(extractInstagramPost([igScript({ ...igItem, caption: null })], { handle: "wena", sourceId: "DQabc123xyz" }).post.text, "");
  assert.deepEqual(extractInstagramPost([igScript({ ...igItem, user: { username: "other" } })], { handle: "wena", sourceId: "DQabc123xyz" }), { error: "OTHER_ACCOUNT" });
  assert.deepEqual(extractInstagramPost([igScript(igItem)], { handle: "wena", sourceId: "ZZZZZ9" }), { error: "SOURCE_MISMATCH" });
  assert.deepEqual(extractInstagramPost(['<meta content="1,234 likes, 5 comments - wena on November 10: 오늘 무대">'], { handle: "wena", sourceId: "DQabc123xyz" }), { error: "STRUCTURE_CHANGED" });
});

test("TikTok description and photos come from the rehydration data", () => {
  const item = { id: "7561234567890123456", desc: "연습 끝 🎧 #wena", createTime: "1762740000", author: { uniqueId: "wena" }, video: { cover: "https://p16-sign.tiktokcdn.com/cover.jpeg" } };
  const page = data => JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: data } } } });
  const { post } = extractTikTokPost(page(item), { handle: "wena", sourceId: item.id });
  assert.equal(post.text, "연습 끝 🎧 #wena");
  assert.deepEqual(post.images, []);
  assert.deepEqual(post.videoThumbnail, { url: "https://p16-sign.tiktokcdn.com/cover.jpeg" });
  const photo = { ...item, imagePost: { images: [{ imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/1.jpeg"] } }] } };
  assert.deepEqual(extractTikTokPost(page(photo), { handle: "wena", sourceId: item.id }).post.images, [{ url: "https://p16-sign.tiktokcdn.com/1.jpeg" }]);
  assert.deepEqual(extractTikTokPost(null, { handle: "wena", sourceId: item.id }), { error: "STRUCTURE_CHANGED" });
});

test("collectSource reports login walls and layout changes instead of an empty success", async () => {
  const pages = new Map([
    ["https://www.instagram.com/wena/", { finalUrl: "https://www.instagram.com/wena/", hrefs: ["/p/DQabc123xyz/", "/p/DQbroken01/"], scripts: [] }],
    ["https://www.instagram.com/wena/p/DQabc123xyz/", { finalUrl: "https://www.instagram.com/wena/p/DQabc123xyz/", hrefs: [], scripts: [igScript(igItem)] }],
    ["https://www.instagram.com/wena/p/DQbroken01/", { finalUrl: "https://www.instagram.com/wena/p/DQbroken01/", hrefs: [], scripts: [] }],
  ]);
  const browser = { read: async url => pages.get(url) };
  const { request, unread } = await collectSource(browser, igSource);
  assert.equal(request.posts.length, 1);
  assert.equal(request.posts[0].text, caption);
  assert.deepEqual(unread, [{ sourceId: "DQbroken01", error: "STRUCTURE_CHANGED" }]);
  assert.equal("title" in request.posts[0], false);

  const walled = await collectSource({ read: async () => ({ finalUrl: "https://www.instagram.com/accounts/login/", hrefs: [], scripts: [] }) }, igSource);
  assert.deepEqual(walled.request, buildIngestRequest(igSource, [], "BLOCKED_LOGIN"));
  const empty = await collectSource({ read: async () => ({ finalUrl: "https://www.instagram.com/wena/", hrefs: [], scripts: [] }) }, igSource);
  assert.equal(empty.request.collectorError, "STRUCTURE_CHANGED");
});

test("sendIngest uses the dedicated secret and refuses plain HTTP endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ runId: "r", items: [] }), { status: 200 }); };
  await sendIngest(fetchImpl, "https://dev.kyaa.io/api/internal/sns-ingest", "s".repeat(40), { posts: [] });
  assert.equal(calls[0].init.headers.authorization, `Bearer ${"s".repeat(40)}`);
  assert.equal(calls[0].init.redirect, "error");
  await assert.rejects(sendIngest(fetchImpl, "http://dev.kyaa.io/x", "s".repeat(40), {}), /ENDPOINT_INVALID/);
  await assert.rejects(sendIngest(fetchImpl, "https://dev.kyaa.io/x", "", {}), /SECRET_MISSING/);
  const refused = async () => new Response(JSON.stringify({ error: { code: "SOURCE_NOT_REGISTERED" } }), { status: 403 });
  await assert.rejects(sendIngest(refused, "https://dev.kyaa.io/x", "s".repeat(40), {}), /SNS_INGEST_HTTP_403_SOURCE_NOT_REGISTERED/);
});

test("Instagram video covers stay separate from original body photos", () => {
  const item = { code: "DQabc123xyz", media_type: 2, taken_at: 1762740000, user: { username: "wena" }, caption: { text: "원문 캡션" }, image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/video-cover.jpg", width: 720, height: 1280 }] } };
  const result = extractInstagramPost([JSON.stringify({ xdt_api__v1__media__shortcode__web_info: { items: [item] } })], { handle: "wena", sourceId: item.code });
  assert.deepEqual(result.post.images, []);
  assert.deepEqual(result.post.videoThumbnail, { url: "https://scontent.cdninstagram.com/video-cover.jpg" });
  assert.equal(result.post.text, "원문 캡션");
});

test("a failed post read preserves already collected originals", async () => {
  const result = await collectSource({ async read(url) {
    if (url === igSource.accountUrl) return { finalUrl: url, hrefs: ['/p/DQabc123xyz/', '/p/DQbroken01/'] };
    if (url.includes('DQbroken01')) throw new Error('timeout');
    return { finalUrl: url, scripts: [igScript(igItem)] };
  } }, igSource);
  assert.equal(result.request.posts.length, 1);
  assert.equal(result.request.posts[0].text, caption);
  assert.deepEqual(result.unread, [{ sourceId: 'DQbroken01', error: 'READ_FAILED' }]);
});
