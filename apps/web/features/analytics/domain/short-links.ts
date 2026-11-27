/**
 * kyaa.io/go/<code>: short addresses for the places we post or send a link. Each code opens a kyaa page with its tags,
 * so the first-visit cookie and the sign-up record know where the visitor came from.
 * Add a code here; the admin traffic screen lists them with a copy button.
 */
export type ShortLinkGroup = "outreach" | "channel" | "kol" | "qr";
export type ShortLink = {
  code: string;
  group: ShortLinkGroup;
  utm: { source: string; medium: string; campaign: string; content?: string };
  /** Where the code opens. Home unless a code names another page. */
  path: "/" | "/s/raffle";
  /** The name kept in outbound_link_visits (lowercase words joined by hyphens). */
  visit: string;
};

const RAFFLE = "/s/raffle";

const outreach = ([
  ["vtuber", "streamer_outreach"],
  ["idol", "idol_outreach_kr"],
  ["idol-jp", "idol_outreach_jp"],
  ["news", "newstip"],
  ["ig", "instagram_dm"],
] as const).map(([code, campaign]): ShortLink => ({
  code, group: "outreach", path: "/", visit: campaign.replaceAll("_", "-"),
  utm: { source: "x", medium: "dm", campaign },
}));

const channels = ([
  ["mail-raffle", "email", "email", "raffle_mail", RAFFLE],
  ["newstip", "newstip", "email", "newstip", "/"],
  ["ig-dm", "instagram", "dm", "dm_outreach", "/"],
  ["x-dm", "x", "dm", "dm_outreach", "/"],
  ["tiktok-dm", "tiktok", "dm", "dm_outreach", "/"],
  ["supertoday", "supertoday", "referral", "sweeps_listing", RAFFLE],
  ["soompi", "soompi", "referral", "media", "/"],
] as const).map(([code, source, medium, campaign, path]): ShortLink => ({
  code, group: "channel", path, visit: code, utm: { source, medium, campaign },
}));

const raffleChannels = ([
  ["ig-dm-raffle", "instagram", "dm"],
  ["newstip-raffle", "newstip", "email"],
  ["x-dm-raffle", "x", "dm"],
  ["tg-raffle", "telegram", "channel"],
] as const).map(([code, source, medium]): ShortLink => ({
  code, group: "channel", path: RAFFLE, visit: code,
  utm: { source, medium, campaign: "raffle-1125", content: code },
}));

/** Paid raffle posts on X. The handle is the campaign, which the raffle page already reads as the KOL. */
export const KOL_HANDLES = [
  "alina", "luna", "chae", "robin", "cj", "cgaa", "enzo", "poelzem", "dafren", "nisa", "yuna", "lailology", "ayo", "lyxx",
] as const;
const kols = KOL_HANDLES.map((handle): ShortLink => ({
  code: `kol-${handle}`, group: "kol", path: RAFFLE, visit: `kol-${handle}`,
  utm: { source: "x", medium: "kol", campaign: handle, content: `kol-${handle}` },
}));

export const SHORT_LINKS: readonly ShortLink[] = [...outreach, ...channels, ...raffleChannels, ...kols];
const byCode = new Map(SHORT_LINKS.map((link) => [link.code, link]));

/** Codes made on the spot: qr-<event> for a printed QR, sweeps-<site> for a giveaway listing site. */
export const SHORT_LINK_PATTERNS = ["qr-<event>", "sweeps-<site>"] as const;
const patternCode = /^(qr|sweeps)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function shortLink(code: string): ShortLink | null {
  const fixed = byCode.get(code);
  if (fixed) return fixed;
  const match = code.length <= 48 ? patternCode.exec(code) : null;
  if (!match) return null;
  const [, kind, name] = match as unknown as [string, "qr" | "sweeps", string];
  return kind === "qr"
    ? { code, group: "qr", path: "/", visit: code, utm: { source: "qr", medium: "offline", campaign: name.replaceAll("-", "_") } }
    : { code, group: "channel", path: RAFFLE, visit: code, utm: { source: name.replaceAll("-", "_"), medium: "referral", campaign: "sweeps_listing" } };
}

export function shortLinkDestination(link: ShortLink, origin: string): URL {
  const destination = new URL(link.path, origin);
  destination.search = new URLSearchParams({
    utm_source: link.utm.source,
    utm_medium: link.utm.medium,
    utm_campaign: link.utm.campaign,
    ...(link.utm.content ? { utm_content: link.utm.content } : {}),
  }).toString();
  return destination;
}
