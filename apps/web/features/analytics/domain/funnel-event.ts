import { z } from "zod";
import { acquisitionChannelSchema, acquisitionLanding } from "./acquisition-attribution";

/** Funnel events of the self ledger. Names follow funnel-audit/ga4-plan.md so the same moments can later go to GA4. */
export const FUNNEL_CLIENT_EVENT_NAMES = ["page_view", "share_completed"] as const;
export const FUNNEL_SERVER_EVENT_NAMES = [
  "fan_verification_started",
  "fan_verification_submitted",
  "daily_checkin_completed",
  "post_created",
  "comment_created",
  "cheer_completed",
] as const;
export type FunnelClientEventName = (typeof FUNNEL_CLIENT_EVENT_NAMES)[number];
export type FunnelServerEventName = (typeof FUNNEL_SERVER_EVENT_NAMES)[number];

/**
 * Self ledger name → GA4 event name (ga4-plan.md §6). passport_issued keeps its name on both sides. The browser sends the
 * GA4 event at the client success point of the same action (ga4-client.ts); comment_create has no sender yet.
 */
export const GA4_EVENT_NAME = {
  page_view: "page_view",
  login_result: "login",
  profile_completed: "sign_up",
  share_completed: "share",
  fan_verification_started: "fan_verification_start",
  fan_verification_submitted: "fan_verification_submit",
  passport_issued: "passport_issued",
  daily_checkin_completed: "daily_checkin",
  post_created: "post_create",
  comment_created: "comment_create",
  cheer_completed: "cheer",
  benefit_entered: "raffle_entry",
} as const satisfies Partial<Record<FunnelClientEventName | FunnelServerEventName | "passport_issued" | "login_result" | "profile_completed" | "benefit_entered", string>>;

export const pageKindSchema = z.enum([
  "home", "creator_directory", "creator", "live_directory", "live", "benefit", "fan_guide",
  "community", "login", "onboarding", "my", "passport", "verification", "other",
]);
export type PageKind = z.infer<typeof pageKindSchema>;

export const pageViewPropertiesSchema = z.object({
  pageKind: pageKindSchema,
  entry: z.boolean(),
  channel: acquisitionChannelSchema,
  device: z.enum(["mobile", "tablet", "desktop"]),
  browser: z.enum(["instagram", "kakao", "safari", "chrome", "other"]),
  os: z.enum(["ios", "android", "other"]),
}).strict().refine((value) => value.entry || value.channel === "internal", { message: "Only the entry screen carries a channel" });
export type PageViewProperties = z.infer<typeof pageViewPropertiesSchema>;

export const shareContentTypeSchema = z.enum(["post", "notice", "passport", "jjinfan", "share_proof"]);
export type ShareContentType = z.infer<typeof shareContentTypeSchema>;
export const sharePropertiesSchema = z.object({
  method: z.enum(["native", "copy"]),
  contentType: shareContentTypeSchema,
}).strict();
export type ShareProperties = z.infer<typeof sharePropertiesSchema>;

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const pageViewKey = new RegExp(`^page-view:${uuid}$`);
const shareKey = new RegExp(`^share:${uuid}:completed$`);

/** Screens that are never counted: staff tools and sign-in plumbing. */
const untrackedPath = /^\/(?:admin|operator|creator|api|auth|connect)(?:\/|$)/;

/** Only the kind of screen leaves the browser; no path, slug, query or hash. Null means do not record. */
export function pageKindForPath(pathname: string): PageKind | null {
  if (untrackedPath.test(pathname)) return null;
  const landing = acquisitionLanding(pathname);
  if (landing) return landing;
  if (/^\/community(?:\/|$)/.test(pathname) || /^\/c\/[^/]+\/(?:community|lounge)(?:\/|$)/.test(pathname)) return "community";
  if (/^\/login(?:\/|$)/.test(pathname)) return "login";
  if (/^\/onboarding(?:\/|$)/.test(pathname)) return "onboarding";
  if (/^\/c\/[^/]+\/verify(?:\/|$)/.test(pathname)) return "verification";
  if (/^\/(?:passports|stamps)(?:\/|$)/.test(pathname)) return "passport";
  if (/^\/(?:my|settings|notifications)(?:\/|$)/.test(pathname)) return "my";
  return "other";
}

export function deviceContext(ua: string): Pick<PageViewProperties, "device" | "browser" | "os"> {
  const tablet = /ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua));
  return {
    device: tablet ? "tablet" : /mobi|iphone|ipod|android/i.test(ua) ? "mobile" : "desktop",
    browser: /instagram/i.test(ua) ? "instagram" : /kakaotalk/i.test(ua) ? "kakao"
      : /chrome|crios/i.test(ua) ? "chrome" : /safari/i.test(ua) ? "safari" : "other",
    os: /iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "other",
  };
}

type EventShape = {
  eventName: string; source: string; idempotencyKey: string; properties: unknown;
  appUserId?: string | null; anonymousSessionId: string | null;
  celebrityId: string | null; liveEventId: string | null; missionId: string | null; benefitId: string | null;
};

/** Mirrors the record_product_event_v1 rules of 20261219010000 for the two browser events. */
export function validateFunnelClientEvent(event: EventShape, context: z.RefinementCtx): void {
  if (event.eventName !== "page_view" && event.eventName !== "share_completed") return;
  const noEntities = [event.celebrityId, event.liveEventId, event.missionId, event.benefitId].every((id) => id === null);
  const valid = event.eventName === "page_view"
    ? noEntities && event.source === "web.page_view" && pageViewKey.test(event.idempotencyKey)
      && pageViewPropertiesSchema.safeParse(event.properties).success
    : noEntities && event.source === "web.share" && shareKey.test(event.idempotencyKey)
      && sharePropertiesSchema.safeParse(event.properties).success;
  if (!valid) context.addIssue({ code: "custom", message: `Invalid ${event.eventName} event` });
}
