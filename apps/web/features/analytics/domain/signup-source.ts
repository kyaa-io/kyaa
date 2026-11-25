import { z } from "zod";

const hostSchema = z.enum([
  "t.co", "x.com", "twitter.com", "www.x.com", "www.twitter.com",
  "l.instagram.com", "instagram.com", "www.instagram.com",
  "koreapas.com", "www.koreapas.com", "reddit.com", "www.reddit.com", "old.reddit.com", "redd.it",
  "threads.net", "www.threads.net", "threads.com", "www.threads.com",
  "google.com", "www.google.com", "search.naver.com", "www.facebook.com",
]);
const sourceSchema = z.enum([
  "x", "instagram", "threads", "reddit", "koreapas", "email", "discord", "facebook", "meta", "google",
  "telegram", "supertoday", "localvibe",
]);
const mediumSchema = z.enum(["community", "kol", "paid", "referral"]);
const campaignSchema = z.literal("raffle-1125");
// Per-partner (kol-<handle>) and per-keyword (g-kw-<keyword>) tags share a fixed prefix.
const contentSchema = z.union([z.enum([
  "ig-story", "member-1125", "fb-group", "fb-group-ko", "r-giveaways", "r-sweepstakes",
  "r-kpoppers", "kyaa-pin-ko", "kyaa-pin", "x-promo-pin", "m-phid-img1", "m-us-img1", "m-kr-img1",
  "tg-channel", "discord", "koreapas-post", "supertoday", "localvibe-banner",
]), z.string().regex(/^(?:kol|g-kw)-[a-z0-9_-]{1,24}$/)]);
const pathSchema = z.enum([
  "/", "/s/raffle", "/celebrities", "/live", "/live/:event", "/benefits/:benefit",
  "/c/:creator/raffles", "/c/:creator/raffles/:raffle", "/guide", "/pages/elina-fan-guide",
  "/pages/ifew-fan-guide", "/pages/us-fanmeetings", "/community", "/login", "/:creator",
]);

export const signupSourceFields = z.object({
  referrerHost: hostSchema.optional(),
  utmSource: sourceSchema.optional(),
  utmMedium: mediumSchema.optional(),
  utmCampaign: campaignSchema.optional(),
  utmContent: contentSchema.optional(),
  landingPath: pathSchema.optional(),
}).strict();

function allowed<T extends z.ZodType>(schema: T, value: string | null): z.output<T> | undefined {
  return schema.safeParse(value?.toLowerCase()).data;
}

export function captureSignupSource(pathname: string, params: Pick<URLSearchParams, "get">, referrer: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  const landingPath = pathSchema.safeParse(path).data
    ?? (/^\/live\/[^/]+$/.test(path) ? "/live/:event"
      : /^\/benefits\/[^/]+$/.test(path) ? "/benefits/:benefit"
      : /^\/c\/[^/]+\/raffles$/.test(path) ? "/c/:creator/raffles"
      : /^\/c\/[^/]+\/raffles\/[^/]+$/.test(path) ? "/c/:creator/raffles/:raffle"
      : /^\/[^/]+$/.test(path) ? "/:creator" : undefined);
  let hostname: string | null = null;
  try {
    hostname = new URL(referrer).hostname.replace(/\.$/, "");
  } catch {
    // Direct visits and malformed referrers have no source host.
  }
  const values = {
    referrerHost: allowed(hostSchema, hostname),
    utmSource: allowed(sourceSchema, params.get("utm_source")),
    utmMedium: allowed(mediumSchema, params.get("utm_medium")),
    utmCampaign: allowed(campaignSchema, params.get("utm_campaign")),
    utmContent: allowed(contentSchema, params.get("utm_content")),
    landingPath,
  };
  return signupSourceFields.parse(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)));
}
