import { resolveCreatorImage } from "./creator-image-config";

/** Only explicitly registered public CMS paths use the shared image optimizer. */
export const publicImageRemotePatterns = ["kyaa.io", "dev.kyaa.io", "staging.kyaa.io"].map((hostname) => ({
  protocol: "https" as const, hostname, port: "", pathname: "/public-assets/cms-assets/**", search: "",
}));

export function bypassImageOptimization(source: string): boolean {
  if (source.startsWith("/")) return false;
  try {
    const url = new URL(source);
    return !publicImageRemotePatterns.some((pattern) =>
      url.protocol === "https:" && url.hostname === pattern.hostname &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname.startsWith(pattern.pathname.slice(0, -2)));
  } catch {
    return true;
  }
}

// Compatibility for consumers measuring the standard square profile crop.
export function creatorCropScale(slug: string): number {
  return resolveCreatorImage({ slug, src: undefined }).crop.scale;
}

/** 홈 배너 그림 칸(2026-11-09 규격): 배너 안쪽 오른쪽, 1440+에서 약 572px, 768~1439에서 배너 폭의 40~42%, 모바일은 166px(home-hero-banner.module.css). */
export function homeHeroSizes(): string {
  return "(min-width: 1440px) 572px, (min-width: 1024px) calc((100vw - 80px) * 0.42), (min-width: 768px) calc((100vw - 64px) * 0.4), 166px";
}

/** GGGI 캠페인 그림도 같은 칸이다. */
export function homeHeroCampaignSizes(): string {
  return homeHeroSizes();
}
