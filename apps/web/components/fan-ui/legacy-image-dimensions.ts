import { cmsAssetBase, cmsAssetPath } from "./cms-asset-source";

/** Measured legacy public source dimensions; no inferred dimensions for remote assets. */
export const legacyImageDimensions: Readonly<Record<string, readonly [number, number]>> = {
  "/images/celebrities/changha/profile-autumn-20261113.webp": [680, 680],
  "/images/celebrities/changha/profile-autumn-sharp-20261113.webp": [540, 540],
  "/images/celebrities/changha/gggi-20261030.jpg": [1883, 2510],
  "/images/calendar/aryeom-profile.jpg": [
    1080,
    1080
  ],
  "/images/calendar/jenny-jeong-profile.jpg": [
    1080,
    1080
  ],
  "/images/calendar/xin-profile.jpg": [
    4096,
    2537
  ],
  "/images/calendar/yuna-portrait.jpg": [
    800,
    1200
  ],
  "/images/celebrities/aryeom/hero-portrait.jpg": [
    3072,
    4096
  ],
  "/images/celebrities/changha/profile-20261021.webp": [1200, 1200],
  "/images/celebrities/changha/hero-desktop-20261021.webp": [1880, 995],
  "/images/celebrities/changha/portrait-20261021.webp": [1440, 1920],
  "/images/celebrities/changha/calendar-20261021.webp": [1200, 1600],
  "/images/celebrities/changha/hero-mobile.jpg": [
    3567,
    5351
  ],
  "/images/celebrities/changha/hero-source.jpg": [
    2160,
    1620
  ],
  "/images/celebrities/elina/hero-beach.jpg": [
    2730,
    1820
  ],
  "/images/celebrities/elina/hero-source.jpg": [
    3072,
    4096
  ],
  "/images/celebrities/ifewknow/hero-studio.jpg": [
    2160,
    3240
  ],
  "/images/celebrities/ifewknow/hero-editorial-soft-20260911.webp": [1672, 941],
  "/images/celebrities/ifewknow/hero-editorial-portrait-20260911.webp": [1122, 1402],
  "/images/celebrities/jenny-jeong/hero-source.jpg": [
    3386,
    2667
  ],
  "/images/celebrities/katseye/card.webp": [
    800,
    1000
  ],
  "/images/celebrities/katseye/hero-desktop.webp": [
    2400,
    1200
  ],
  "/images/celebrities/katseye/hero-mobile.webp": [
    960,
    1200
  ],
  "/images/celebrities/katseye/live-replay.webp": [
    1280,
    720
  ],
  "/images/celebrities/katseye/live-upcoming-1.webp": [
    1280,
    720
  ],
  "/images/celebrities/katseye/live-upcoming-2.webp": [
    1280,
    720
  ],
  "/images/celebrities/katseye/profile.webp": [
    400,
    400
  ],
  "/images/celebrities/park-myungho/hero-portrait.jpg": [
    1440,
    1800
  ],
  "/images/celebrities/park-myungho/profile-20260910.png": [
    510,
    765
  ],
  "/images/celebrities/thisisj-official/hero-source.webp": [
    1440,
    1440
  ],
  "/images/celebrities/xin/hero-concept-mobile.jpg": [
    4032,
    6048
  ],
  "/images/celebrities/xin/hero-concept.jpg": [
    4096,
    2730
  ],
  "/images/celebrities/yuna/hero-beach.jpg": [
    2730,
    1820
  ],
  "/images/celebrities/yuna/hero-studio-mobile.jpg": [
    5304,
    7952
  ],
  "/images/guest-home/banksy-exhibition-campaign.webp": [
    1672,
    941
  ],
  "/images/guest-home/kyaa-wordmark-transparent.png": [
    1200,
    580
  ],
  "/images/guest-home/byus-wordmark-transparent.png": [
    1200,
    580
  ],
  "/images/guest-home/changha-card.jpg": [
    1080,
    1080
  ],
  "/images/guest-home/chzzk.png": [
    512,
    512
  ],
  "/images/guest-home/elina-card.jpg": [
    1080,
    1080
  ],
  "/images/guest-home/kara-card.jpg": [
    3933,
    2503
  ],
  "/images/guest-home/kara-hero.png": [
    2784,
    1768
  ],
  "/images/guest-home/passport-open-blank-9-transparent.png": [
    1536,
    1024
  ],
  "/images/guest-home/passport-open-blank-9.png": [
    1536,
    1024
  ],
  "/images/guest-home/passport-open-empty.png": [
    1536,
    1024
  ],
  "/images/guest-home/passport-open.webp": [
    1303,
    840
  ],
  "/images/guest-home/ss501.jpg": [
    450,
    594
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/yuna/profile-f6180ad3a36ea5c1.webp": [
    1067,
    1600
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/xin/profile-f2ec8b19121877f6.jpg": [
    4096,
    2537
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/jenny-jeong/profile-a9daf680da1fe99b.jpg": [
    853,
    1280
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/aryeom/profile-f596fa168833a2cb.jpg": [
    1080,
    1080
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/park-myungho/profile-536c3c1765064266.jpg": [
    1080,
    1350
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/ifewknow/profile-7951fc437251547f.png": [
    1622,
    1622
  ],
  "https://kyaa.io/public-assets/cms-assets/celebrities/thisisj-official/profile-b0e528d586a167fb.jpg": [
    540,
    540
  ],
  "/images/celebrities/changha/hero-editorial-20260911.webp": [1672, 940],
  "/images/celebrities/aryeom/hero-editorial-20260911.webp": [1672, 941],
  "/images/celebrities/jenny-jeong/hero-editorial-20260911.webp": [1672, 941],
  "/images/celebrities/park-myungho/hero-editorial-20260911.webp": [1672, 941],
  "/images/celebrities/thisisj-official/hero-editorial-20260911.webp": [1672, 941],
  "/images/celebrities/yuna/hero-editorial-portrait-20260911.webp": [1122, 1402],
  "/images/celebrities/changha/hero-editorial-portrait-20260911.webp": [1122, 1402],
  "/images/celebrities/aryeom/hero-editorial-portrait-20260911.webp": [1122, 1402],
  "/images/celebrities/jenny-jeong/hero-editorial-portrait-20260911.webp": [1122, 1402],
  "/images/celebrities/park-myungho/hero-editorial-portrait-20260911.webp": [1122, 1402],
  "/images/celebrities/thisisj-official/hero-editorial-portrait-20260911.webp": [1122, 1402],
};

/** CMS photos are measured once; the same file reads the same size from any environment host. */
export function legacyImageSize(source: string): readonly [number, number] | undefined {
  const path = cmsAssetPath(source);
  return legacyImageDimensions[path ? cmsAssetBase + path : source];
}
