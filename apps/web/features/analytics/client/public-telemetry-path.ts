import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";
// Public routes for the sampled AWS performance telemetry. New routes are excluded until their public-only data boundary is reviewed.
export function isPublicTelemetryPath(pathname: string, publicCreatorSlug?: string): boolean {
  if (/^\/(?:c\/)?kyaa-wave-fanpage(?:\/|$)/i.test(pathname)) return false;
  if (/(?:^|[/-])(?:rehearsal|test|demo)(?:[/-]|$)/i.test(pathname)) return false;
  return (publicCreatorSlug !== undefined && pathname === `/${publicCreatorSlug}` && creatorSlugFromHomePath(pathname) === publicCreatorSlug)
    || /^(?:\/|\/(?:celebrities|live|benefits|guide|privacy|terms))$/.test(pathname)
    || /^\/pages\/(?:partners|creator-onboarding|elina-fan-guide|ifew-fan-guide|us-fanmeetings)$/.test(pathname)
    || /^\/(?:live|benefits)\/[a-zA-Z0-9_-]+$/.test(pathname)
    || /^\/c\/[a-zA-Z0-9_-]+(?:\/(?:leaderboard|raffles(?:\/[a-zA-Z0-9_-]+)?|notices\/[a-zA-Z0-9_-]+))?$/.test(pathname);
}
