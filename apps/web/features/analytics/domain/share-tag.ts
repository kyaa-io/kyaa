/**
 * Tags on a link a member shares from our screens: utm_source=share, utm_medium=referral, utm_content=<surface>,
 * and ref=<invite code> when the sharer has one. The sharer's own arrival tags and ad click ids are dropped first,
 * so a friend's sign-up is counted as a share, not as the ad or post that once brought the sharer.
 */
export type ShareSurface =
  | "raffle" | "passport" | "passport_x" | "jjinfan" | "share_proof" | "notice" | "post" | "group_invite" | "shorts";

const ARRIVAL_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "twclid", "fbclid", "ttclid", "msclkid", "kyaa_browser"];

export function shareTagged(href: string, surface: ShareSurface, options: { campaign?: string; ref?: string } = {}): string {
  const url = new URL(href);
  const params = url.searchParams;
  for (const key of ARRIVAL_KEYS) params.delete(key);
  params.set("utm_source", "share");
  params.set("utm_medium", "referral");
  if (options.campaign) params.set("utm_campaign", options.campaign);
  params.set("utm_content", surface);
  if (options.ref && /^[A-Za-z0-9_-]{1,32}$/.test(options.ref) && !params.has("invite")) params.set("ref", options.ref);
  return url.href;
}
