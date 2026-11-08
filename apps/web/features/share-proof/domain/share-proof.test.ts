import { describe, expect, it } from "vitest";
import { checkShareProofUrl, parseShareProofUrl } from "./share-proof";

const IG = "C1aBc_D-2xY", YT = "dQw4w9WgXcQ", TT = "7430000000000000001", XID = "1850000000000000001", TH = "DAbC12xYz9";

describe("allowed networks and hosts", () => {
  it.each([
    [`https://www.instagram.com/p/${IG}/`, `instagram:${IG}`],
    [`https://instagram.com/reel/${IG}`, `instagram:${IG}`],
    [`https://m.instagram.com/tv/${IG}`, `instagram:${IG}`],
    [`https://www.instagram.com/fanname/p/${IG}/`, `instagram:${IG}`],
    [`https://www.tiktok.com/@fan/video/${TT}`, `tiktok:${TT}`],
    [`https://m.tiktok.com/@fan/photo/${TT}`, `tiktok:${TT}`],
    [`https://x.com/fan/status/${XID}`, `x:${XID}`],
    [`https://mobile.twitter.com/fan/status/${XID}`, `x:${XID}`],
    [`https://x.com/i/web/status/${XID}`, `x:${XID}`],
    [`https://www.threads.net/@fan/post/${TH}`, `threads:${TH}`],
    [`https://threads.com/@fan/post/${TH}`, `threads:${TH}`],
    [`https://www.youtube.com/watch?v=${YT}`, `youtube:${YT}`],
    [`https://m.youtube.com/shorts/${YT}`, `youtube:${YT}`],
    [`https://youtu.be/${YT}`, `youtube:${YT}`],
  ])("accepts %s as %s", (input, key) => { expect(parseShareProofUrl(input)?.key).toBe(key); });

  it.each([
    [`https://www.facebook.com/fan/posts/123456789`, "unsupported"],
    [`https://cafe.naver.com/fancafe/123`, "unsupported"],
    [`https://weverse.io/elina/artist/1-123456`, "unsupported"],
    [`https://blog.naver.com/fan/223000000000`, "unsupported"],
    [`https://music.youtube.com/watch?v=${YT}`, "unsupported"],
    [`https://evil.instagram.com.example.com/p/${IG}`, "unsupported"],
    [`http://www.instagram.com/p/${IG}/`, "unsupported"],
    [`https://user:pw@instagram.com/p/${IG}`, "unsupported"],
    [`https://instagram.com:8443/p/${IG}`, "unsupported"],
    [`javascript:alert(1)`, "unsupported"],
    [`https://vm.tiktok.com/ZMabc123/`, "short"],
    [`https://vt.tiktok.com/ZSabc123/`, "short"],
    [`https://t.co/abc123`, "short"],
    [`https://bit.ly/abc123`, "short"],
    [`https://l.instagram.com/?u=https%3A%2F%2Fexample.com`, "short"],
    [`https://www.instagram.com/elina_official/`, "not_post"],
    [`https://www.tiktok.com/@fan`, "not_post"],
    [`https://x.com/fan`, "not_post"],
    [`https://x.com/i/status/1`, "not_post"],
    [`https://x.com/fan/status/12`, "not_post"],
    [`https://www.youtube.com/@kyaa`, "not_post"],
    [`https://www.youtube.com/watch?v=short`, "not_post"],
    [`https://www.youtube.com/redirect?q=https://example.com`, "not_post"],
    [`https://www.tiktok.com/@fan/video/123`, "not_post"],
    [`https://www.threads.net/@fan`, "not_post"],
  ])("refuses %s (%s)", (input, problem) => {
    const checked = checkShareProofUrl(input);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.problem).toBe(problem);
  });
});

describe("one post, one key", () => {
  it.each([
    ["Instagram p, reel, tv, query, upper-case host and path word, trailing slash, mobile host", [`https://www.instagram.com/p/${IG}/?igsh=xyz`, `https://INSTAGRAM.com/REEL/${IG}`, `https://m.instagram.com/tv/${IG}/#c`, `instagram.com/p/${IG}`]],
    ["YouTube watch, shorts, youtu.be, extra query", [`https://www.youtube.com/watch?v=${YT}&t=10&si=abc`, `https://m.youtube.com/shorts/${YT}/`, `https://youtu.be/${YT}?si=x`, `https://YouTube.com/watch?v=${YT}`]],
    ["X, Twitter, mobile host, other user name, query", [`https://x.com/fan/status/${XID}?s=20`, `https://twitter.com/Someone/status/${XID}`, `https://mobile.x.com/fan/STATUS/${XID}/`]],
    ["TikTok with and without www, query", [`https://www.tiktok.com/@fan/video/${TT}?is_from_webapp=1`, `https://tiktok.com/@Fan/video/${TT}/`, `https://m.tiktok.com/@fan/video/${TT}`]],
    ["Threads .net and .com", [`https://www.threads.net/@fan/post/${TH}?xmt=1`, `https://threads.com/@fan/post/${TH}/`]],
  ])("%s", (_name, inputs) => {
    expect(new Set(inputs.map(input => parseShareProofUrl(input)?.key)).size).toBe(1);
    expect(parseShareProofUrl(inputs[0]!)).not.toBeNull();
  });

  it("keeps the id's letter case: two ids that differ only in case are two posts", () => {
    expect(parseShareProofUrl(`https://www.youtube.com/watch?v=${YT}`)!.key).not.toBe(parseShareProofUrl(`https://www.youtube.com/watch?v=${YT.toLowerCase()}`)!.key);
    expect(parseShareProofUrl(`https://instagram.com/p/${IG}`)!.key).toBe(`instagram:${IG}`);
  });

  it("stores the address without tracking query, with the video id on a watch address", () => {
    expect(parseShareProofUrl(`https://WWW.Instagram.com/p/${IG}/?utm_source=ig`)!.url).toBe(`https://www.instagram.com/p/${IG}/`);
    expect(parseShareProofUrl(`https://www.youtube.com/watch?v=${YT}&t=1`)!.url).toBe(`https://www.youtube.com/watch?v=${YT}`);
  });
});
