import "server-only";
import { communityInviteShortTargetSchema } from "@/features/community-stamps/domain/community-stamps";
import { groupReferralPath, inviteShortSlugPattern } from "@/features/groups/ui/group-referral-link";
import type { AppLocale } from "@/i18n/locales";
import type { CommunityStampDependencies } from "./routes";

/** 261107-2 E3: /i/<slug> -> the invite landing with the code and destination, or null when the address is unknown or no longer usable. */
export async function resolveInviteShortLink(slug: string, locale: AppLocale, deps: Pick<CommunityStampDependencies, "rpc">, query?: URLSearchParams) {
  if (!inviteShortSlugPattern.test(slug)) return null;
  let target;
  try { target = communityInviteShortTargetSchema.parse(await deps.rpc("resolve_community_invite_short_link", { p_slug: slug })); }
  catch (error) {
    if (error instanceof Error && error.message === "COMMUNITY_STAMP_NOT_FOUND") return null;
    throw new Error("Invite link is unavailable");
  }
  const path = groupReferralPath(locale, target.code, target.destination);
  // Campaign tags someone added to the short address travel on to the landing; nothing else from the request does.
  const utm = [...(query?.entries() ?? [])].filter(([key]) => /^utm_(source|medium|campaign|content|term)$/.test(key));
  return utm.length ? `${path}&${new URLSearchParams(utm)}` : path;
}
