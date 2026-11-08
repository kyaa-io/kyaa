/** Public CMS artwork lives in one bucket served by every environment under the same path. */
export const cmsAssetBase = "https://kyaa.io/public-assets/cms-assets/";

const cmsAssetBases = [cmsAssetBase, "https://dev.kyaa.io/public-assets/cms-assets/", "https://staging.kyaa.io/public-assets/cms-assets/"] as const;

/** The path inside the CMS bucket, independent of which environment host the URL names. */
export function cmsAssetPath(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  const base = cmsAssetBases.find((prefix) => source.startsWith(prefix));
  const path = base ? source.slice(base.length) : "";
  return path && !/[?#]/.test(path) ? path : undefined;
}
