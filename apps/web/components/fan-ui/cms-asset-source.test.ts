import { describe, expect, it } from "vitest";
import { cmsAssetPath } from "./cms-asset-source";
import { legacyImageSize } from "./legacy-image-dimensions";

describe("CMS asset source", () => {
  it("reads the bucket path from any environment host and nothing else", () => {
    const path = "celebrities/jenny-jeong/profile-a9daf680da1fe99b.jpg";
    for (const host of ["kyaa.io", "dev.kyaa.io", "staging.kyaa.io"]) expect(cmsAssetPath(`https://${host}/public-assets/cms-assets/${path}`)).toBe(path);
    for (const source of [
      undefined, null, "", `/public-assets/cms-assets/${path}`,
      `https://kyaa.io.evil.example/public-assets/cms-assets/${path}`,
      `https://kyaa.io/public-assets/fan-avatars/${path}`,
      `https://kyaa.io/public-assets/cms-assets/${path}?token=private`,
      `https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/${path}`,
      "https://kyaa.io/public-assets/cms-assets/",
    ]) expect(cmsAssetPath(source)).toBeUndefined();
  });

  it("measures the same file on every environment host", () => {
    const path = "celebrities/park-myungho/profile-536c3c1765064266.jpg";
    expect(legacyImageSize(`https://kyaa.io/public-assets/cms-assets/${path}`)).toEqual([1080, 1350]);
    expect(legacyImageSize(`https://dev.kyaa.io/public-assets/cms-assets/${path}`)).toEqual([1080, 1350]);
    expect(legacyImageSize("/images/guest-home/ss501.jpg")).toEqual([450, 594]);
    expect(legacyImageSize("https://kyaa.io/public-assets/cms-assets/unknown.jpg")).toBeUndefined();
  });
});
