/** AdSense display units placed by hand in the existing ad spaces. Each one needs its ad unit ID (data-ad-slot) from the
 * AdSense console; a space whose ID is not set draws nothing. */
export const ADSENSE_PLACEMENTS = ["home_mid", "board_side"] as const;
export type AdsensePlacement = (typeof ADSENSE_PLACEMENTS)[number];
export type AdsenseUnits = Partial<Record<AdsensePlacement, string>>;

const ENV_KEYS: Record<AdsensePlacement, string> = {
  home_mid: "ADSENSE_SLOT_HOME_MID",
  board_side: "ADSENSE_SLOT_BOARD_SIDE",
};

/**
 * The units this page may draw. `pageCarriesAdsense` is the proxy's x-byus-adsense decision (kyaa.io, a page with
 * content), so a unit never appears where the adsbygoogle.js snippet is not loaded. `ADSENSE_UNIT_PREVIEW=1` draws the
 * reserved spaces off AWS (local checks) without loading anything from Google.
 */
export function adsenseUnits(env: Record<string, string | undefined>, pageCarriesAdsense: boolean, awsHosting: boolean): AdsenseUnits | null {
  const preview = !awsHosting && env.ADSENSE_UNIT_PREVIEW === "1";
  if (!preview && (!pageCarriesAdsense || env.ADSENSE_APPROVED !== "true")) return null;
  const units: AdsenseUnits = {};
  for (const placement of ADSENSE_PLACEMENTS) {
    const value = env[ENV_KEYS[placement]]?.trim() ?? "";
    if (/^\d{6,12}$/.test(value)) units[placement] = value;
  }
  return Object.keys(units).length ? units : null;
}
