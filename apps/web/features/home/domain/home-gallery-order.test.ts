import { describe, expect, it } from "vitest";
import { homeGalleryPhotoSchema, type HomeGalleryPhoto } from "./home-gallery";
import { diversifyGalleryPhotos, diversifyShorts, homeGalleryPostPhotos } from "./home-gallery-order";

const photo = (id: string, slug?: string): HomeGalleryPhoto => ({ id, source: "official_sns", image: { url: "https://example.com/a.jpg", width: 4, height: 5 }, alt: id, ...(slug ? { creator: { slug, name: slug } } : {}) });
const ids = (list: readonly HomeGalleryPhoto[]) => list.map(item => item.id);

it("selects only original notice photos for the home gallery", () => {
  const post = { ...photo("notice:1", "creator"), sourceHref: "/c/creator/notices/post" };
  expect(homeGalleryPostPhotos([
    { ...post, source: "cms_upload" },
    { ...post, sourceHref: "/live/event" },
    photo("missing-link", "creator"),
    post,
  ])).toEqual([post]);
});

it("mixes public board attachments with notices and accepts only their protected media routes", () => {
  const id = "90000000-0000-4000-8000-000000000001";
  const post = { ...photo("n:1", "a"), sourceHref: "/c/a/notices/news" };
  const fan = homeGalleryPhotoSchema.parse({ ...photo("f:1", "b"), source: "fan_post",
    image: { ...post.image, url: `/api/content-assets/${id}` }, sourceHref: `/c/b/community/${id}` });
  const group = homeGalleryPhotoSchema.parse({ ...photo("g:1", "c"), source: "group_post",
    image: { ...post.image, url: `/api/groups/media/${id}` }, sourceHref: `/pages/groups/${id}?tab=board&post=${id}` });
  expect(homeGalleryPostPhotos([fan, group, post])).toEqual([fan, group, post]);
  expect(homeGalleryPhotoSchema.safeParse({ ...fan, image: post.image }).success).toBe(false);
  expect(homeGalleryPhotoSchema.safeParse({ ...group, sourceHref: "/c/c" }).success).toBe(false);
});

describe("diversifyGalleryPhotos", () => {
  it("takes one photo per post first and puts the other cuts after everything else", () => {
    const list = [photo("n1:0", "a"), photo("n1:1", "a"), photo("n2:0", "b"), photo("n3:0", "c")];
    expect(ids(diversifyGalleryPhotos(list))).toEqual(["n1:0", "n2:0", "n3:0", "n1:1"]);
  });

  it("goes round-robin over creators and never repeats a creator back to back while another has photos", () => {
    const list = [photo("p1:0", "a"), photo("p2:0", "a"), photo("p3:0", "a"), photo("p4:0", "b"), photo("p5:0", "b"), photo("p6:0", "c")];
    const out = diversifyGalleryPhotos(list);
    expect(ids(out)).toEqual(["p1:0", "p4:0", "p6:0", "p2:0", "p5:0", "p3:0"]);
    out.slice(1).forEach((item, i) => expect(item.creator?.slug).not.toBe(out[i]!.creator?.slug));
  });

  it("starts a round with another creator than the one just shown", () => {
    const list = [photo("p1:0", "a"), photo("p2:0", "b"), photo("p3:0", "a"), photo("p4:0", "a")];
    expect(diversifyGalleryPhotos(list).map(item => item.creator?.slug)).toEqual(["a", "b", "a", "a"]);
  });

  it("keeps every photo, treats a photo without a creator as its own creator, and keeps a creator's newest first", () => {
    const list = [photo("m:1:image", "a"), photo("c1:0"), photo("c2:0"), photo("m:2:image", "a")];
    const out = diversifyGalleryPhotos(list);
    expect(out).toHaveLength(4);
    expect(ids(out).indexOf("m:1:image")).toBeLessThan(ids(out).indexOf("m:2:image"));
    expect(diversifyGalleryPhotos([])).toEqual([]);
  });
});

describe("diversifyGalleryPhotos featured creators", () => {
  const wina = [photo("w1:0", "wina"), photo("w2:0", "wina"), photo("w3:0", "wina")];
  const featuredOld = [photo("y1:0", "yuna"), photo("e1:0", "elina"), photo("c1:0", "changha"), photo("c2:0", "changha")];
  it("opens with changha, elina, yuna newest photos even when wina is far newer", () => {
    const out = diversifyGalleryPhotos([...wina, ...featuredOld]);
    expect(ids(out).slice(0, 3)).toEqual(["c1:0", "e1:0", "y1:0"]);
    expect(out[3]?.creator?.slug).toBe("wina");
  });
  it("skips a featured creator without photos and keeps every photo once", () => {
    const list = [...wina, photo("y1:0", "yuna"), photo("c1:0", "changha"), photo("c2:0", "changha")];
    const out = diversifyGalleryPhotos(list);
    expect(ids(out).slice(0, 2)).toEqual(["c1:0", "y1:0"]);
    expect(ids(out).sort()).toEqual(ids(list).sort());
  });
  it("does not repeat the last featured creator right after the featured row", () => {
    const out = diversifyGalleryPhotos([photo("y1:0", "yuna"), photo("y2:0", "yuna"), photo("w1:0", "wina"), photo("e1:0", "elina")]);
    expect(out.map(item => item.creator?.slug)).toEqual(["elina", "yuna", "wina", "yuna"]);
  });
});

describe("diversifyShorts", () => {
  const short = (id: string, slug: string) => ({ id, creator: { slug } });
  it("takes creators in turn, newest first inside one creator, and never repeats a creator back to back while another has shorts", () => {
    const list = [short("a1", "a"), short("a2", "a"), short("a3", "a"), short("b1", "b"), short("a4", "a"), short("c1", "c"), short("b2", "b")];
    const out = diversifyShorts(list);
    expect(out.map(item => item.id)).toEqual(["a1", "b1", "c1", "a2", "b2", "a3", "a4"]);
    out.slice(1, 6).forEach((item, i) => expect(item.creator.slug).not.toBe(out[i]!.creator.slug));
  });
  it("keeps the first twelve to several creators when one creator dominates the newest list", () => {
    const list = [...Array.from({ length: 20 }, (_, i) => short(`a${i}`, "a")), ...["b", "c", "d", "e"].flatMap(slug => [short(`${slug}1`, slug), short(`${slug}2`, slug)])];
    const firstTwelve = diversifyShorts(list).slice(0, 12);
    expect(new Set(firstTwelve.map(item => item.creator.slug)).size).toBe(5);
    expect(firstTwelve.filter(item => item.creator.slug === "a").length).toBeLessThanOrEqual(4);
  });
  it("keeps every short", () => { expect(diversifyShorts([])).toEqual([]); expect(diversifyShorts([short("a", "a"), short("b", "a")])).toHaveLength(2); });
});

it("alternates platforms while retaining all shorts", () => {
  const list = [{ id: "a", platform: "tiktok", creator: { slug: "a" } }, { id: "b", platform: "tiktok", creator: { slug: "b" } }, { id: "c", platform: "youtube", creator: { slug: "c" } }];
  expect(diversifyShorts(list).map(item => item.platform)).toEqual(["tiktok", "youtube", "tiktok"]);
});

describe("diversifyShorts with Instagram reels, YouTube Shorts and TikTok", () => {
  const short = (id: string, platform: string, slug: string) => ({ id, platform, creator: { slug } });
  // Newest first, as the read answers: TikTok has been posted most, so the newest six are all TikTok.
  const newest = [
    short("t1", "tiktok", "a"), short("t2", "tiktok", "b"), short("t3", "tiktok", "c"), short("t4", "tiktok", "a"), short("t5", "tiktok", "b"), short("t6", "tiktok", "c"),
    short("i1", "instagram", "a"), short("i2", "instagram", "b"), short("y1", "youtube", "c"), short("y2", "youtube", "a"),
  ];
  it("shows all three platforms near the top even when TikTok is the newest run", () => {
    const top = diversifyShorts(newest).slice(0, 6);
    expect(new Set(top.map(item => item.platform))).toEqual(new Set(["tiktok", "instagram", "youtube"]));
  });
  it("never repeats a creator back to back while another creator is left, and keeps every short", () => {
    const out = diversifyShorts(newest);
    expect(out).toHaveLength(newest.length);
    expect(new Set(out.map(item => item.id)).size).toBe(newest.length);
    out.slice(1).forEach((item, i) => {
      const left = out.slice(i + 1).some(other => other.creator.slug !== out[i]!.creator.slug);
      if (left) expect(item.creator.slug).not.toBe(out[i]!.creator.slug);
    });
  });
  it("alternates platforms across the first rows and does not hold back a creator's older short behind other platforms for good", () => {
    const out = diversifyShorts(newest);
    out.slice(1, 6).forEach((item, i) => expect(item.platform).not.toBe(out[i]!.platform));
    expect(out.map(item => item.id).indexOf("t4")).toBeLessThan(out.map(item => item.id).indexOf("y2"));
  });
});
