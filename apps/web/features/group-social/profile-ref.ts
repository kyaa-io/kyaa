import type { HomeFanProfileRef } from "@/features/rankings/domain/types";

export const PROFILE_RETURN_PARAM = "profile";

/** "The author of this content". Public replies carry no member id, so the server finds the person from what the viewer sees (B6). */
export type ProfileRef =
  | { kind: "profile"; profileId: string }
  | HomeFanProfileRef
  | { kind: "fan_post" | "fan_post_comment" | "group_post"; id: string }
  | { kind: "page_ranking"; slug: string; metric: "fan_contribution" | "dukjil"; period: "week" | "month" | "all"; periodStart: string; computedAt: string; rank: number }
  | { kind: "return"; token: string };
export type ContentRef = Extract<ProfileRef, { kind: "fan_post" | "fan_post_comment" | "group_post" }>;

export const encodeProfileRef = (ref: ProfileRef) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(ref)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export const refKey = (ref: ContentRef) => `${ref.kind}:${ref.id}`;

/** Where the window comes back to after sign-in: this page with the return ref. */
export function profileReturnPath(returnRef: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(PROFILE_RETURN_PARAM, returnRef);
  return url.pathname + url.search + url.hash;
}
