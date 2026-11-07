import { outboundCampaignSchema } from "@/features/analytics/domain/outbound-link";
import type { AppLocale } from "@/i18n/locales";

/** The fan page reads `?share=jjinfan` and answers the gauge image in its link preview. */
export const JJINFAN_SHARE_VALUE = "jjinfan";

/**
 * Share link for a 찐팬 100 gauge (feedback C7). It opens the creator's fan page, where the gauge is.
 * UTM follows the common shape of features/analytics/README.md: source kyaa, campaign = the public slug (or kyaa), content = <place>.<kind>;
 * the medium is `share` because the link leaves through the viewer's own share sheet, not an outbound anchor. No member value goes in.
 */
export function jjinfanShareUrl(origin: string, slug: string, locale: AppLocale) {
  const campaign = outboundCampaignSchema.safeParse(slug).success ? slug : "kyaa";
  const query = new URLSearchParams({ locale, share: JJINFAN_SHARE_VALUE, utm_source: "kyaa", utm_medium: "share", utm_campaign: campaign, utm_content: "jjinfan_gauge.share" });
  return `${origin.replace(/\/$/, "")}/${encodeURIComponent(slug)}?${query}`;
}

/** Server-drawn preview image. The count in the query makes a new image address when the count moves, so link previews do not keep an old number. */
export function jjinfanShareImagePath(slug: string, count: number, locale: AppLocale) {
  return `/share/jjinfan/${encodeURIComponent(slug)}?locale=${locale}&n=${Math.max(0, Math.trunc(count))}`;
}
