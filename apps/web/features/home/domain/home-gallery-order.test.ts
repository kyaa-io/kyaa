import { describe, expect, it } from "vitest";
import type { HomeGalleryPhoto } from "./home-gallery";
import { diversifyGalleryPhotos } from "./home-gallery-order";

const photo = (id: string, slug?: string): HomeGalleryPhoto => ({ id, source: "official_sns", image: { url: "https://example.com/a.jpg", width: 4, height: 5 }, alt: id, ...(slug ? { creator: { slug, name: slug } } : {}) });
const ids = (list: readonly HomeGalleryPhoto[]) => list.map(item => item.id);

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
