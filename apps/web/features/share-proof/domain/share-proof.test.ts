import { expect, it } from "vitest";
import { parseShareProofUrl } from "./share-proof";

it.each([
  ["https://www.instagram.com/p/C1abc/?utm_source=ig_web_copy_link", "instagram", "instagram:p/c1abc", "https://www.instagram.com/p/C1abc/"],
  ["instagram.com/reels/C9xyz", "instagram", "instagram:reel/c9xyz", "https://instagram.com/reels/C9xyz"],
  ["https://x.com/kyaa/status/1850000000000000000?s=20", "x", "x:1850000000000000000", "https://x.com/kyaa/status/1850000000000000000"],
  ["https://twitter.com/kyaa/status/1850000000000000000", "x", "x:1850000000000000000", undefined],
  ["https://www.tiktok.com/@fan/video/7430000000000000000", "tiktok", "tiktok:7430000000000000000", undefined],
  ["https://vm.tiktok.com/ZMabc123/", "tiktok", "tiktok:short/zmabc123", undefined],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtube", "youtube:dqw4w9wgxcq", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ?si=abc", "youtube", "youtube:dqw4w9wgxcq", undefined],
  ["https://youtube.com/shorts/abcDEF12345", "youtube", "youtube:abcdef12345", undefined],
  ["https://www.threads.net/@fan/post/Cabc123", "threads", "threads:cabc123", undefined],
  ["https://m.blog.naver.com/fanblog/223000000000", "naver_blog", "naver_blog:fanblog/223000000000", undefined],
  ["https://blog.naver.com/PostView.naver?blogId=fanblog&logNo=223000000000&from=search", "naver_blog", "naver_blog:fanblog/223000000000", "https://blog.naver.com/PostView.naver?blogId=fanblog&logNo=223000000000"],
  ["https://bsky.app/profile/fan.bsky.social/post/3kabc", "bluesky", "bluesky:fan.bsky.social/3kabc", undefined],
])("accepts the post %s", (input, platform, key, url) => {
  const parsed = parseShareProofUrl(input);
  expect(parsed?.platform).toBe(platform);
  expect(parsed?.key).toBe(key);
  if (url) expect(parsed?.url).toBe(url);
});

it.each([
  "", "hello", "http://www.instagram.com/p/C1abc/", "https://www.instagram.com/elina_official/", "https://x.com/kyaa", "https://www.youtube.com/@kyaa",
  "https://www.tiktok.com/@fan", "https://example.com/p/C1abc", "https://user:pw@instagram.com/p/C1abc", "https://instagram.com:8443/p/C1abc", "javascript:alert(1)",
  "https://blog.naver.com/fanblog", `https://x.com/a/status/${"1".repeat(400)}`,
])("refuses %s (not a post, not https, or not a supported network)", input => {
  expect(parseShareProofUrl(input)).toBeNull();
});

it("gives one key to the same post however it was copied", () => {
  const a = parseShareProofUrl("https://www.instagram.com/p/C1abc/?igsh=xyz")!, b = parseShareProofUrl("https://instagram.com/p/C1abc")!, c = parseShareProofUrl("https://m.instagram.com/p/c1abc/#x")!;
  expect(new Set([a.key, b.key, c.key]).size).toBe(1);
});
