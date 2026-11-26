import { z } from "zod";
import { inAppBrowserKind } from "@/components/login-browser-policy";

/**
 * The way a visitor reached kyaa, read by the server from the first page request (no auth SDK, no script).
 * Kept in two first-party cookies for 90 days: the first visit, and the latest visit that came from outside.
 * Signup copies both onto the new member. No IP and no raw user agent: only the in-app browser kind.
 */
export const FIRST_TOUCH_COOKIE = "kyaa_ft";
export const LAST_TOUCH_COOKIE = "kyaa_lt";
export const TOUCH_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

const token = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);
const appKind = z.enum(["x", "instagram", "threads", "kakao", "facebook", "line", "tiktok", "telegram", "webview", "browser"]);
export const touchSchema = z.object({
  src: token.optional(),
  med: token.optional(),
  cmp: token.optional(),
  cnt: token.optional(),
  trm: token.optional(),
  /** Which ad click id was on the address. The id itself is not kept. */
  clk: z.enum(["gclid", "twclid", "fbclid", "ttclid", "msclkid"]).optional(),
  /** Invite code (?ref= or the raffle's ?invite=). */
  ref: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  /** Referring site's host name, when it was another site. */
  rh: z.string().regex(/^[a-z0-9.-]{1,100}$/).optional(),
  /** The app whose built-in browser opened this page. */
  app: appKind,
  /** The app the visitor left for this browser (the ?kyaa_browser= our hand-off adds). */
  via: appKind.optional(),
  /** Landing path with id-like segments hidden. */
  lp: z.string().regex(/^\/[a-z0-9_/:-]{0,80}$/),
  at: z.iso.datetime(),
}).strict();
export type Touch = z.infer<typeof touchSchema>;

const CLICK_IDS = ["gclid", "twclid", "fbclid", "ttclid", "msclkid"] as const;

function tokenValue(value: string | null): string | undefined {
  return token.safeParse(value?.trim().toLowerCase()).data;
}

/** `/elina`, `/s/raffle` stay; ids, tokens and anything deeper than two segments become `:id` or are dropped. */
export function landingPathPattern(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean).slice(0, 2);
  return `/${segments.map((segment) => /^[a-z][a-z0-9_-]{0,23}$/.test(segment) && !/\d{4,}/.test(segment) ? segment : ":id").join("/")}`;
}

function referrerHost(referer: string | null, siteHost: string): string | undefined {
  if (!referer) return undefined;
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/\.$/, "");
    const site = siteHost.toLowerCase().replace(/^www\./, "");
    if (host === site || host.endsWith(`.${site}`)) return undefined;
    return touchSchema.shape.rh.safeParse(host).data;
  } catch {
    return undefined;
  }
}

export function captureTouch(input: { url: URL; referer: string | null; userAgent: string; now: Date }): Touch {
  const params = input.url.searchParams;
  const ref = params.get("ref") ?? params.get("invite");
  // Chemi share links carry the share id (?from= from the database, ?share= from the games) instead of tags.
  const chemiShare = !params.has("utm_source") && /^\/chemi(?:\/|$)/.test(input.url.pathname) && (params.has("from") || params.has("share"));
  const values: Touch = {
    src: chemiShare ? "share" : tokenValue(params.get("utm_source")),
    med: chemiShare ? "referral" : tokenValue(params.get("utm_medium")),
    cmp: tokenValue(params.get("utm_campaign")),
    cnt: chemiShare ? "chemi" : tokenValue(params.get("utm_content")),
    trm: tokenValue(params.get("utm_term")),
    clk: CLICK_IDS.find((key) => params.has(key)),
    ref: touchSchema.shape.ref.safeParse(ref?.trim()).data,
    rh: referrerHost(input.referer, input.url.hostname),
    app: appKind.parse(inAppBrowserKind(input.userAgent)),
    via: appKind.safeParse(params.get("kyaa_browser")).data,
    lp: landingPathPattern(input.url.pathname),
    at: input.now.toISOString(),
  };
  return touchSchema.parse(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)));
}

/** A visit that says where it came from: a tag, an ad click, an invite, a hand-off, or another site. */
export function isExternalEntry(touch: Touch): boolean {
  return Boolean(touch.src || touch.med || touch.cmp || touch.clk || touch.ref || touch.rh || touch.via);
}

export function encodeTouch(touch: Touch): string {
  return Buffer.from(JSON.stringify(touch), "utf8").toString("base64url");
}

export function decodeTouch(value: string | undefined | null): Touch | null {
  if (!value || value.length > 1024) return null;
  try {
    return touchSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))).data ?? null;
  } catch {
    return null;
  }
}

/** Reads one cookie from a raw Cookie header (API routes get no parsed cookie jar). */
export function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
